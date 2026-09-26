// @vitest-environment happy-dom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { sampleProject } from "../data"
import type { Project, RoomModel } from "../types"
import { useStudioController } from "./useStudioController"

const api = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
  room: vi.fn(),
  interpret: vi.fn(),
  status: vi.fn(),
}))
vi.mock("../project-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../project-api")>()),
  isServerMode: true,
  getProject: api.load,
  saveProject: api.save,
  saveRoom: api.room,
}))
vi.mock("../local-ai", () => ({
  checkLocalModel: vi.fn().mockResolvedValue("qwen3:4b"),
  interpretLocally: api.interpret,
}))
vi.mock("../layout-proposals", () => ({
  getServerCatalog: vi.fn().mockResolvedValue([]),
  proposalStatus: api.status,
  previewIntent: vi.fn(),
  actOnProposal: vi.fn(),
  readLayoutChoice: vi.fn(),
}))

const room: RoomModel = {
  version: 2,
  unit: "m",
  wallHeight: 2.4,
  bounds: { width: 6, depth: 4 },
  outline: [
    [0, 0],
    [6, 0],
    [6, 4],
    [0, 4],
  ],
  walls: [],
  openings: [],
  rooms: [],
}
const project: Project = { ...sampleProject, revision: 3, room, furniture: [] }
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
  })
  return renderHook(useStudioController, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  })
}
beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  sessionStorage.clear()
  api.load.mockResolvedValue(project)
  api.interpret.mockResolvedValue({
    reply: "어떤 가구인가요?",
    clarification: "어떤 가구인가요?",
    commands: [],
  })
})
afterEach(cleanup)

describe("studio writes with local assistant", () => {
  it("reloads from the server even when the 30-second query cache is fresh", async () => {
    const hook = setup()
    await waitFor(() =>
      expect(hook.result.current.projectLoad.status).toBe("ready")
    )
    api.load.mockResolvedValueOnce({ ...project, revision: 8 })
    await act(() => hook.result.current.reloadSavedProject())
    expect(api.load).toHaveBeenCalledTimes(2)
    expect(hook.result.current.project.revision).toBe(8)
  })

  it("waits for an in-flight save before reload and blocks edits until the fresh response arrives", async () => {
    const saved = deferred<Project>(),
      loaded = deferred<Project>()
    api.save.mockReturnValueOnce(saved.promise)
    const hook = setup()
    await waitFor(() =>
      expect(hook.result.current.projectLoad.status).toBe("ready")
    )
    act(() => hook.result.current.addFurniture("chair-shell", [1, 1]))
    await waitFor(() => expect(api.save).toHaveBeenCalledOnce())
    api.load.mockReturnValueOnce(loaded.promise)
    let reloading!: Promise<void>
    act(() => {
      reloading = hook.result.current.reloadSavedProject()
    })
    act(() => hook.result.current.addFurniture("plant-olive", [3, 2]))
    expect(api.load).toHaveBeenCalledOnce()
    expect(hook.result.current.project.furniture).toHaveLength(1)
    const serverState = { ...api.save.mock.calls[0][0], revision: 4 }
    await act(async () => {
      saved.resolve(serverState)
      await saved.promise
    })
    await waitFor(() => expect(api.load).toHaveBeenCalledTimes(2))
    act(() => hook.result.current.addFurniture("plant-olive", [3, 2]))
    expect(api.save).toHaveBeenCalledOnce()
    await act(async () => {
      loaded.resolve(serverState)
      await reloading
    })
    expect(hook.result.current.project).toEqual(serverState)
    expect(hook.result.current.dirty).toBe(false)
    expect(hook.result.current.busy).toBeNull()
  })

  it("serializes rapid saves using the latest server revision without discarding newer edits", async () => {
    const first = deferred<Project>(),
      second = deferred<Project>()
    api.save
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const hook = setup()
    await waitFor(() =>
      expect(hook.result.current.projectLoad.status).toBe("ready")
    )
    act(() => hook.result.current.addFurniture("chair-shell", [1, 1]))
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1))
    act(() => hook.result.current.addFurniture("plant-olive", [3, 2]))
    expect(api.save).toHaveBeenCalledTimes(1)
    await act(async () => {
      first.resolve({ ...api.save.mock.calls[0][0], revision: 4 })
      await first.promise
    })
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(2))
    expect(api.save.mock.calls[1][0].revision).toBe(4)
    expect(hook.result.current.project.furniture).toHaveLength(2)
    expect(hook.result.current.dirty).toBe(true)
    await act(async () => {
      second.resolve({ ...api.save.mock.calls[1][0], revision: 5 })
      await second.promise
    })
    await waitFor(() => expect(hook.result.current.dirty).toBe(false))
    expect(hook.result.current.project.revision).toBe(5)
    expect(hook.result.current.project.furniture).toHaveLength(2)
  })

  it("waits for auto save before changing room structure and blocks overlapping edits", async () => {
    const saved = deferred<Project>()
    api.save.mockReturnValueOnce(saved.promise)
    api.room.mockImplementation(async (current: Project, next: RoomModel) => ({
      ...current,
      room: next,
      revision: 5,
    }))
    const hook = setup()
    await waitFor(() =>
      expect(hook.result.current.projectLoad.status).toBe("ready")
    )
    act(() => hook.result.current.addFurniture("chair-shell", [1, 1]))
    await waitFor(() => expect(api.save).toHaveBeenCalledOnce())
    let changed!: Promise<boolean>
    act(() => {
      changed = hook.result.current.applyRoom(room)
    })
    act(() => hook.result.current.addFurniture("plant-olive", [3, 2]))
    expect(api.room).not.toHaveBeenCalled()
    expect(hook.result.current.project.furniture).toHaveLength(1)
    await act(async () => {
      saved.resolve({ ...api.save.mock.calls[0][0], revision: 4 })
      await changed
    })
    expect(api.room.mock.calls[0][0].revision).toBe(4)
    expect(hook.result.current.project.revision).toBe(5)
  })

  it("keeps an unsaved draft after failure and does not send it to the model", async () => {
    const saved = deferred<Project>()
    api.save.mockReturnValueOnce(saved.promise)
    const hook = setup()
    await waitFor(() =>
      expect(hook.result.current.projectLoad.status).toBe("ready")
    )
    act(() => hook.result.current.addFurniture("chair-shell", [1, 1]))
    await waitFor(() => expect(api.save).toHaveBeenCalledOnce())
    act(() => hook.result.current.sendMessage("의자 추가"))
    expect(api.interpret).not.toHaveBeenCalled()
    await act(async () => {
      saved.reject(new Error("저장 실패"))
      await saved.promise.catch(() => {})
    })
    await waitFor(() =>
      expect(hook.result.current.assistant.error).toContain("저장 실패")
    )
    expect(hook.result.current.project.furniture).toHaveLength(1)
    expect(hook.result.current.dirty).toBe(true)
    expect(hook.result.current.saveFailed).toBe(true)
    expect(api.interpret).not.toHaveBeenCalled()
    expect(api.save).toHaveBeenCalledOnce()
  })

  it("feeds the saved revision to the model after pending manual writes finish", async () => {
    const saved = deferred<Project>()
    api.save.mockReturnValueOnce(saved.promise)
    const hook = setup()
    await waitFor(() =>
      expect(hook.result.current.projectLoad.status).toBe("ready")
    )
    act(() => hook.result.current.addFurniture("chair-shell", [1, 1]))
    await waitFor(() => expect(api.save).toHaveBeenCalledOnce())
    act(() => hook.result.current.sendMessage("의자 추가"))
    expect(api.interpret).not.toHaveBeenCalled()
    await act(async () => {
      saved.resolve({ ...api.save.mock.calls[0][0], revision: 4 })
      await saved.promise
    })
    await waitFor(() => expect(api.interpret).toHaveBeenCalledOnce())
    expect(api.interpret.mock.calls[0][1].revision).toBe(4)
    expect(api.interpret.mock.calls[0][1].furniture).toHaveLength(1)
  })

  it("recovering project A invalidates a late load of project B and clears cross-project undo", async () => {
    const initial = deferred<Project>()
    const original = { ...project, id: "project-a", name: "원래 프로젝트" }
    api.load
      .mockReturnValueOnce(initial.promise)
      .mockResolvedValueOnce(original)
    sessionStorage.setItem(
      "kokoro-pending-local-proposal",
      JSON.stringify({ projectId: original.id, proposalId: "proposal-a" })
    )
    api.status.mockResolvedValue({
      id: "proposal-a",
      status: "PENDING",
      baseRevision: 3,
      proposedFurniture: [],
      actions: [],
      result: null,
    })
    const hook = setup()
    await act(() => hook.result.current.assistant.act("recover"))
    expect(hook.result.current.project.id).toBe(original.id)
    expect(hook.result.current.projectLoad.status).toBe("ready")
    await act(async () => {
      initial.resolve(project)
      await initial.promise
    })
    expect(hook.result.current.project.id).toBe(original.id)
    expect(hook.result.current.canUndo).toBe(false)
    expect(hook.result.current.assistant.locked).toBe(true)
    expect(hook.result.current.assistant.proposalProjectId).toBe(original.id)
  })
})
