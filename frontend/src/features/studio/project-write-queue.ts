import { ApiError } from "@/lib/http-client"

import type { Furniture, Project } from "./types"

export class WriteCancelledError extends Error {
  constructor() {
    super("프로젝트를 바꿔서 저장하지 않은 요청을 취소했어요.")
    this.name = "WriteCancelledError"
  }
}

export class WriteSkippedError extends Error {
  constructor(cause: unknown) {
    super("앞선 저장이 실패해서 이 변경을 저장하지 못했어요.", { cause })
    this.name = "WriteSkippedError"
  }
}

export function saveFailureKind(error: unknown): "rejected" | "network" {
  return error instanceof ApiError &&
    !error.retryable &&
    error.status !== null &&
    error.status >= 400 &&
    error.status < 500
    ? "rejected"
    : "network"
}

type Task = {
  kind: string
  layout?: Furniture[]
  run: (saved: Project) => Promise<{ project: Project; result: unknown }>
  resolve: (value: unknown) => void
  reject: (error: unknown) => void
  promise: Promise<unknown>
}

type Options = {
  /** Start writing after the previous project's request finishes. */
  after?: Promise<unknown>
  saveLayout: (saved: Project, furniture: Furniture[]) => Promise<Project>
  onChange?: () => void
}

/**
 * Sends layout, room, and command writes for one project in request order.
 * The server reads and rewrites the whole project, so overlapping requests can overwrite earlier changes.
 * `saved` is the last server-confirmed snapshot, separate from the on-screen draft.
 */
export class ProjectWriteQueue {
  readonly projectId: string
  private savedProject: Project
  private readonly pending: Task[] = []
  private running: Task | null = null
  private isClosed = false
  private idle: Promise<void> = Promise.resolve()
  private readonly options: Options

  constructor(saved: Project, options: Options) {
    this.projectId = saved.id
    this.savedProject = saved
    this.options = options
    if (options.after) this.idle = options.after.then(noop, noop)
  }

  get saved() {
    return this.savedProject
  }

  get closed() {
    return this.isClosed
  }

  get busy() {
    return this.running !== null || this.pending.length > 0
  }

  saveLayout(furniture: Furniture[]): Promise<Project> {
    const tail = this.pending.at(-1)
    if (tail?.layout) {
      tail.layout = furniture
      return tail.promise as Promise<Project>
    }
    const task = this.createTask("layout", async (saved) => {
      const project = await this.options.saveLayout(saved, task.layout!)
      return { project, result: project }
    })
    task.layout = furniture
    return this.push(task) as Promise<Project>
  }

  run<R>(
    kind: string,
    run: (saved: Project) => Promise<{ project: Project; result: R }>
  ): Promise<R> {
    return this.push(this.createTask(kind, run)) as Promise<R>
  }

  rebasePendingLayouts(rebase: (furniture: Furniture[]) => Furniture[]) {
    for (const task of this.pending) {
      if (task.layout) task.layout = rebase(task.layout)
    }
  }

  /** Cancel queued writes and return a promise for the in-flight request. */
  close(): Promise<void> {
    this.isClosed = true
    this.rejectPending(new WriteCancelledError())
    this.options.onChange?.()
    return this.idle
  }

  private createTask(kind: string, run: Task["run"]): Task {
    let resolve!: Task["resolve"]
    let reject!: Task["reject"]
    const promise = new Promise<unknown>((res, rej) => {
      resolve = res
      reject = rej
    })
    // Avoid an unhandled rejection when callers intentionally ignore a task.
    promise.catch(noop)
    return { kind, run, resolve, reject, promise }
  }

  private push(task: Task) {
    if (this.isClosed) {
      task.reject(new WriteCancelledError())
      return task.promise
    }
    this.pending.push(task)
    if (!this.running && this.pending.length === 1) {
      this.idle = this.idle.then(() => this.drain())
    }
    this.options.onChange?.()
    return task.promise
  }

  private async drain() {
    while (this.pending.length && !this.isClosed) {
      const task = this.pending.shift()!
      this.running = task
      this.options.onChange?.()
      try {
        const { project, result } = await task.run(this.savedProject)
        this.savedProject = project
        this.running = null
        task.resolve(result)
      } catch (error) {
        this.running = null
        // Later writes would use a stale snapshot, so reject them without sending.
        this.rejectPending(new WriteSkippedError(error))
        task.reject(error)
      }
      this.options.onChange?.()
    }
  }

  private rejectPending(error: unknown) {
    for (const task of this.pending.splice(0)) task.reject(error)
  }
}

/**
 * Remembers the in-flight writes of closed queues for every project.
 */
export class ClosingWrites {
  private readonly byProject = new Map<string, Promise<void>>()

  add(queue: ProjectWriteQueue): Promise<void> {
    const projectId = queue.projectId
    const closing = Promise.all([
      this.byProject.get(projectId),
      queue.close(),
    ]).then(noop)
    this.byProject.set(projectId, closing)
    void closing.then(() => {
      if (this.byProject.get(projectId) === closing)
        this.byProject.delete(projectId)
    })
    return closing
  }

  for(projectId: string): Promise<void> | undefined {
    return this.byProject.get(projectId)
  }

  all(): Promise<void> {
    return Promise.all(this.byProject.values()).then(noop)
  }
}

function sameItem(a: Furniture | undefined, b: Furniture | undefined) {
  return a === b || JSON.stringify(a) === JSON.stringify(b)
}

export function sameFurniture(a: Furniture[], b: Furniture[]) {
  return (
    a === b ||
    (a.length === b.length && a.every((item, i) => sameItem(item, b[i])))
  )
}

/**
 * Applies the user's furniture changes (`mine`) made after a command (`base`) over the server result (`theirs`).
 * User changes win for touched furniture; all other furniture follows the server result.
 */
export function mergeFurniture(
  base: Furniture[],
  theirs: Furniture[],
  mine: Furniture[]
) {
  if (sameFurniture(base, mine)) return theirs
  const baseById = new Map(base.map((item) => [item.id, item]))
  const mineById = new Map(mine.map((item) => [item.id, item]))
  const changed = (id: string) => !sameItem(baseById.get(id), mineById.get(id))

  const merged: Furniture[] = []
  for (const item of theirs) {
    if (!changed(item.id)) merged.push(item)
    else if (mineById.has(item.id)) merged.push(mineById.get(item.id)!)
  }
  const mergedIds = new Set(merged.map((item) => item.id))
  for (const item of mine) {
    if (!mergedIds.has(item.id) && changed(item.id)) merged.push(item)
  }
  return merged
}

function noop() {}
