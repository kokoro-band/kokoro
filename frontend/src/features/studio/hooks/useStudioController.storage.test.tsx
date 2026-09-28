// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { request } from "@/lib/http-client"
import { sampleProject } from "../data"
import { buildRoomModel, createDraft } from "../room-builder"
import { useStudioController } from "./useStudioController"

// Keep actual local reads, writes and controller. Only control mode and HTTP.
const mode = vi.hoisted(() => ({ server: false }))
vi.mock("../project-api", async (original) => ({
  ...(await original<object>()),
  get isServerMode() {
    return mode.server
  },
}))
vi.mock("@/lib/http-client", async (original) => ({
  ...(await original<object>()),
  request: vi.fn(),
}))
const key = "kokoro-remodel-project-v1"
const activeKey = "kokoro-active-server-project-v1"
const values = new Map<string, string>()
const getItem = vi.fn((key: string) => values.get(key) ?? null)
const setItem = vi.fn((key: string, value: string) => {
  values.set(key, value)
})
const removeItem = vi.fn((key: string) => values.delete(key))
const cleanups: (() => void)[] = []
beforeEach(() => {
  vi.resetAllMocks()
  mode.server = false
  values.clear()
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.stubGlobal("localStorage", { getItem, setItem, removeItem })
  vi.stubGlobal(
    "confirm",
    vi.fn(() => false)
  )
})
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})
async function flush() {
  await act(async () => {
    for (let i = 0; i < 30; i++) await Promise.resolve()
  })
}
async function setup() {
  const result: { current?: ReturnType<typeof useStudioController> } = {}
  function Harness() {
    const current = useStudioController()
    Object.assign(result, { current })
    return <output>{current.notice?.text}</output>
  }
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  cleanups.push(() => {
    act(() => root.unmount())
    client.clear()
    container.remove()
  })
  act(() =>
    root.render(
      <StrictMode>
        <QueryClientProvider client={client}>
          <Harness />
        </QueryClientProvider>
      </StrictMode>
    )
  )
  await flush()
  return { get: () => result.current!, container }
}
describe("storage recovery through the actual controller", () => {
  it.each([
    "",
    "null",
    "{",
    JSON.stringify({ ...sampleProject, dimensions: {} }),
  ])("announces a damaged save without overwriting it: %j", async (raw) => {
    values.set(key, raw)
    const app = await setup()
    expect(app.get().project.id).toBe(sampleProject.id)
    expect(app.container.textContent).toContain("예제")
    expect(app.container.textContent).toContain("원본")
    expect(app.get().notice?.tone).toBe("critical")
    expect(values.get(key)).toBe(raw)
    expect(setItem).not.toHaveBeenCalled()
    expect(removeItem).not.toHaveBeenCalled()
    const firstId = app.get().notice!.id
    act(() => app.get().addFurniture("chair-shell"))
    await flush()
    expect(app.get().notice!.id).toBeGreaterThan(firstId)
  })
  it("treats a missing save as normal first use", async () => {
    const app = await setup()
    expect(app.get().notice).toBeNull()
    expect(setItem).not.toHaveBeenCalled()
  })
  it("explains storage access denial without claiming corruption or writing", async () => {
    getItem.mockImplementation(() => {
      throw new DOMException("private details", "SecurityError")
    })
    const app = await setup()
    expect(app.container.textContent).toContain("저장소")
    expect(app.container.textContent).not.toContain("private details")
    expect(app.get().project.id).toBe(sampleProject.id)
    expect(setItem).not.toHaveBeenCalled()
    expect(removeItem).not.toHaveBeenCalled()
  })
  it("preserves an edited draft and original save when storage is full", async () => {
    const raw = JSON.stringify(sampleProject)
    values.set(key, raw)
    setItem.mockImplementation(() => {
      throw new DOMException("private details", "QuotaExceededError")
    })
    const app = await setup()
    act(() => app.get().addFurniture("chair-shell"))
    await flush()
    expect(app.get().project.furniture).toHaveLength(
      sampleProject.furniture.length + 1
    )
    expect(app.get().dirty).toBe(true)
    expect(app.container.textContent).toContain("저장 공간")
    expect(app.container.textContent).not.toContain("private details")
    expect(values.get(key)).toBe(raw)
    expect(app.get().notice?.action).toBe("retrySave")
    const failureNoticeId = app.get().notice!.id
    setItem.mockImplementation((name, value) => {
      values.set(name, value)
    })
    act(() => app.get().retryFailedSave(failureNoticeId))
    await flush()
    expect(app.get().dirty).toBe(false)
    expect(JSON.parse(values.get(key)!).furniture).toEqual(
      app.get().project.furniture
    )
  })
  it("does not read local project JSON in server mode", async () => {
    mode.server = true
    values.set(
      key,
      JSON.stringify({ ...sampleProject, id: "private-local-project" })
    )
    values.set(activeKey, "server-project")
    vi.mocked(request).mockResolvedValue({
      ...sampleProject,
      id: "server-project",
    })
    const app = await setup()
    expect(getItem.mock.calls.some(([name]) => name === key)).toBe(false)
    expect(app.get().project.id).toBe("server-project")
    expect(app.get().notice).toBeNull()
  })
  it("keeps a new local project unsaved after a failed first write and retries the whole project", async () => {
    const raw = JSON.stringify(sampleProject)
    values.set(key, raw)
    setItem.mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError")
    })
    const app = await setup()
    await act(async () => {
      await app.get().createProject("내 새 프로젝트")
    })
    await flush()
    const id = app.get().project.id
    expect(id).not.toBe(sampleProject.id)
    expect(app.get().dirty).toBe(true)
    expect(app.get().saveFailed).toBe(true)
    expect(values.get(key)).toBe(raw)
    const noticeId = app.get().notice!.id
    const unload = new window.Event("beforeunload", { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(true)
    const confirm = vi.mocked(window.confirm)
    act(() => app.get().openSampleProject())
    expect(confirm).toHaveBeenCalled()
    expect(app.get().project.id).toBe(id)
    setItem.mockImplementation((name, value) => {
      values.set(name, value)
    })
    act(() => app.get().retryFailedSave(noticeId))
    await flush()
    expect(app.get().dirty).toBe(false)
    expect(app.get().saveFailed).toBe(false)
    expect(JSON.parse(values.get(key)!).id).toBe(id)
  })
  it("marks the first local project durable when a later room write succeeds", async () => {
    setItem.mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError")
    })
    const app = await setup()
    await act(async () => {
      await app.get().createProject("빈 프로젝트")
    })
    await flush()
    expect(app.get().dirty).toBe(true)
    setItem.mockImplementation((name, value) => {
      values.set(name, value)
    })
    const room = buildRoomModel(createDraft(20))
    await act(async () => {
      expect(await app.get().applyRoom(room)).toBe(true)
    })
    await flush()
    expect(app.get().dirty).toBe(false)
    expect(JSON.parse(values.get(key)!).room).toEqual(room)
    expect(app.get().saveFailed).toBe(false)
  })
  it.each(["command", "upload", "confirmation"])(
    "recovers a failed first project write through %s but not a no-op or preview",
    async (path) => {
      setItem.mockImplementation(() => {
        throw new DOMException("quota", "QuotaExceededError")
      })
      const app = await setup()
      await act(async () => {
        await app.get().createProject("복구할 프로젝트")
      })
      await flush()
      setItem.mockImplementation((name, value) => {
        values.set(name, value)
      })
      act(() => app.get().sendMessage("지원하지 않는 요청"))
      await flush()
      expect(app.get().dirty).toBe(true)
      if (path === "upload") {
        vi.useFakeTimers()
        act(() =>
          app
            .get()
            .uploadFloorPlan(
              new File(["plan"], "plan.png", { type: "image/png" })
            )
        )
        await act(async () => {
          await vi.advanceTimersByTimeAsync(350)
        })
      } else if (path === "confirmation") {
        act(() => app.get().sendMessage("전부삭제"))
        await flush()
        expect(app.get().commandReview).not.toBeNull()
        expect(app.get().dirty).toBe(true)
        act(() => app.get().confirmCommandReview())
      } else {
        act(() => app.get().sendMessage("의자를 놓아줘"))
      }
      await flush()
      expect(app.get().dirty).toBe(false)
      expect(app.get().saveFailed).toBe(false)
      expect(JSON.parse(values.get(key)!).id).toBe(app.get().project.id)
      const unload = new window.Event("beforeunload", { cancelable: true })
      window.dispatchEvent(unload)
      expect(unload.defaultPrevented).toBe(false)
    }
  )
  it("rejects a corrupt active server ID without requesting a different project", async () => {
    mode.server = true
    values.set(activeKey, "../other-project")
    const app = await setup()
    expect(app.get().projectLoad.status).toBe("error")
    expect(request).not.toHaveBeenCalled()
    expect(values.get(activeKey)).toBe("../other-project")
  })
})
