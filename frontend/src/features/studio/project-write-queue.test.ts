import { describe, expect, it, vi } from "vite-plus/test"

import { ApiError } from "@/lib/http-client"

import { sampleProject } from "./data"
import {
  ClosingWrites,
  mergeFurniture,
  ProjectWriteQueue,
  saveFailureKind,
  WriteCancelledError,
  WriteSkippedError,
} from "./project-write-queue"
import type { Furniture, Project } from "./types"

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

async function flush() {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

const base: Project = structuredClone(sampleProject)
const [sofa, table] = base.furniture

function moved(item: Furniture, x: number): Furniture {
  return { ...item, x }
}

function fakeServer() {
  const calls: {
    kind: string
    saved: Project
    body: unknown
    response: ReturnType<typeof deferred<Project>>
  }[] = []
  const call = (kind: string, saved: Project, body: unknown) => {
    const response = deferred<Project>()
    calls.push({ kind, saved, body, response })
    return response.promise
  }
  return { calls, call }
}

describe("ProjectWriteQueue", () => {
  it("sends one write at a time in request order", async () => {
    const server = fakeServer()
    const queue = new ProjectWriteQueue(base, {
      saveLayout: (saved, furniture) => server.call("layout", saved, furniture),
    })

    const layout = queue.saveLayout([moved(sofa, 1)])
    const room = queue.run("room", async (saved) => {
      const project = await server.call("room", saved, "room")
      return { project, result: project }
    })
    await flush()
    expect(server.calls.map((call) => call.kind)).toEqual(["layout"])

    const afterLayout = { ...base, furniture: [moved(sofa, 1)] }
    server.calls[0].response.resolve(afterLayout)
    await expect(layout).resolves.toBe(afterLayout)
    await flush()

    expect(server.calls.map((call) => call.kind)).toEqual(["layout", "room"])
    expect(server.calls[1].saved).toBe(afterLayout)
    server.calls[1].response.resolve({ ...afterLayout, name: "room saved" })
    await expect(room).resolves.toMatchObject({ name: "room saved" })
    expect(queue.saved.name).toBe("room saved")
    expect(queue.busy).toBe(false)
  })

  it("merges drag layouts into the last value without passing a room write", async () => {
    const server = fakeServer()
    const queue = new ProjectWriteQueue(base, {
      saveLayout: (saved, furniture) => server.call("layout", saved, furniture),
    })

    const first = queue.saveLayout([moved(sofa, 1)])
    await flush()
    const secondBeforeRoom = queue.saveLayout([moved(sofa, 2)])
    const thirdBeforeRoom = queue.saveLayout([moved(sofa, 3)])
    void queue.run("room", async (saved) => {
      const project = await server.call("room", saved, "room")
      return { project, result: project }
    })
    const afterRoom = queue.saveLayout([moved(sofa, 4)])
    const afterRoomMerged = queue.saveLayout([moved(sofa, 5)])

    expect(secondBeforeRoom).toBe(thirdBeforeRoom)
    expect(first).not.toBe(secondBeforeRoom)
    expect(afterRoom).toBe(afterRoomMerged)

    for (let i = 0; i < 4; i++) {
      await flush()
      server.calls[i].response.resolve(base)
    }
    await flush()
    expect(
      server.calls.map((call) =>
        call.kind === "layout"
          ? `layout:${(call.body as Furniture[])[0].x}`
          : call.kind
      )
    ).toEqual(["layout:1", "layout:3", "room", "layout:5"])
  })

  it("rebases queued layouts on top of a command result", async () => {
    const server = fakeServer()
    const queue = new ProjectWriteQueue(base, {
      saveLayout: (saved, furniture) => server.call("layout", saved, furniture),
    })
    const lamp: Furniture = { ...table, id: "lamp", catalogId: "lamp-arc" }

    void queue.run("command", async (saved) => {
      const project = await server.call("command", saved, "램프 놓아줘")
      queue.rebasePendingLayouts((pending) =>
        mergeFurniture(saved.furniture, project.furniture, pending)
      )
      return { project, result: project }
    })
    void queue.saveLayout([moved(sofa, 9), ...base.furniture.slice(1)])
    await flush()

    server.calls[0].response.resolve({
      ...base,
      furniture: [...base.furniture, lamp],
    })
    await flush()

    expect(server.calls[1].kind).toBe("layout")
    const sent = server.calls[1].body as Furniture[]
    expect(sent.find((item) => item.id === sofa.id)?.x).toBe(9)
    expect(sent.some((item) => item.id === "lamp")).toBe(true)
  })

  it("stops after a failure and never marks later writes as saved", async () => {
    const server = fakeServer()
    const queue = new ProjectWriteQueue(base, {
      saveLayout: (saved, furniture) => server.call("layout", saved, furniture),
    })

    const failing = queue.saveLayout([moved(sofa, 100)])
    const room = queue.run("room", async (saved) => {
      const project = await server.call("room", saved, "room")
      return { project, result: project }
    })
    await flush()
    const rejected = new ApiError("가구가 방 밖에 있어요.", 400, false)
    server.calls[0].response.reject(rejected)

    await expect(failing).rejects.toBe(rejected)
    await expect(room).rejects.toBeInstanceOf(WriteSkippedError)
    expect(server.calls).toHaveLength(1)
    expect(queue.saved).toBe(base)
    expect(queue.busy).toBe(false)

    const retry = queue.saveLayout(base.furniture)
    await flush()
    server.calls[1].response.resolve(base)
    await expect(retry).resolves.toBe(base)
  })

  it("keeps a closed project's late response out of the next project", async () => {
    const server = fakeServer()
    const onChange = vi.fn()
    const first = new ProjectWriteQueue(base, {
      saveLayout: (saved, furniture) => server.call("layout", saved, furniture),
    })
    const inFlight = first.saveLayout([moved(sofa, 1)])
    const queued = first.run("room", async (saved) => {
      const project = await server.call("room", saved, "room")
      return { project, result: project }
    })
    await flush()

    const closing = first.close()
    await expect(queued).rejects.toBeInstanceOf(WriteCancelledError)

    const other: Project = { ...base, id: "other", furniture: [] }
    const second = new ProjectWriteQueue(other, {
      after: closing,
      saveLayout: (saved, furniture) => server.call("layout", saved, furniture),
      onChange,
    })
    const next = second.saveLayout([moved(table, 7)])
    await flush()
    expect(server.calls).toHaveLength(1)

    server.calls[0].response.resolve({ ...base, name: "late" })
    await expect(inFlight).resolves.toMatchObject({ name: "late" })
    await flush()

    expect(server.calls).toHaveLength(2)
    expect(server.calls[1].saved.id).toBe("other")
    server.calls[1].response.resolve({ ...other, name: "other saved" })
    await expect(next).resolves.toMatchObject({ id: "other" })
    expect(second.saved.name).toBe("other saved")
    await expect(first.saveLayout([])).rejects.toBeInstanceOf(
      WriteCancelledError
    )
  })
})

describe("ClosingWrites", () => {
  it("keeps waiting for A's write after B's queue also closes", async () => {
    const server = fakeServer()
    const saveLayout = (saved: Project, furniture: Furniture[]) =>
      server.call("layout", saved, furniture)
    const other: Project = { ...base, id: "other" }
    const closing = new ClosingWrites()

    const first = new ProjectWriteQueue(base, { saveLayout })
    void first.saveLayout([moved(sofa, 1)])
    await flush()
    void closing.add(first)
    void closing.add(new ProjectWriteQueue(other, { saveLayout }))

    let reopened = false
    void closing.for(base.id)!.then(() => (reopened = true))
    await flush()
    expect(reopened).toBe(false)
    expect(closing.for(other.id)).toBeUndefined()

    server.calls[0].response.resolve(base)
    await flush()
    expect(reopened).toBe(true)
    expect(closing.for(base.id)).toBeUndefined()
  })
})

describe("mergeFurniture", () => {
  it("returns the server result when nothing changed locally", () => {
    const theirs = [moved(sofa, 5)]
    expect(mergeFurniture(base.furniture, theirs, base.furniture)).toBe(theirs)
  })

  it("keeps local moves, adds, and deletes on top of the server result", () => {
    const added: Furniture = { ...table, id: "new" }
    const theirs = [moved(sofa, 5), moved(table, 6), { ...table, id: "cmd" }]
    const mine = [moved(table, 8), added]

    expect(mergeFurniture([sofa, table], theirs, mine)).toEqual([
      moved(table, 8),
      { ...table, id: "cmd" },
      added,
    ])
  })
})

describe("saveFailureKind", () => {
  it("tells a rejected layout from a connection problem", () => {
    expect(saveFailureKind(new ApiError("invalid", 400, false))).toBe(
      "rejected"
    )
    expect(saveFailureKind(new ApiError("conflict", 409, false))).toBe(
      "rejected"
    )
    expect(saveFailureKind(new ApiError("offline", null, true))).toBe("network")
    expect(saveFailureKind(new ApiError("server", 503, true))).toBe("network")
    expect(saveFailureKind(new Error("quota"))).toBe("network")
  })
})
