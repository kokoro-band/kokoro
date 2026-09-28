// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { request } from "@/lib/http-client"
import { sampleProject } from "../data"
import { useStudioController } from "./useStudioController"

// Keep actual local reads, writes and controller. Only control mode and HTTP.
const mode = vi.hoisted(() => ({ server: false }))
vi.mock("../project-api", async (original) => ({
  ...(await original<object>()),
  get isServerMode() { return mode.server },
}))
vi.mock("@/lib/http-client", async (original) => ({
  ...(await original<object>()), request: vi.fn(),
}))
const key = "kokoro-remodel-project-v1"
const activeKey = "kokoro-active-server-project-v1"
const values = new Map<string, string>()
const getItem = vi.fn((key: string) => values.get(key) ?? null)
const setItem = vi.fn((key: string, value: string) => { values.set(key, value) })
const removeItem = vi.fn((key: string) => values.delete(key))
const cleanups: (() => void)[] = []
beforeEach(() => {
  vi.resetAllMocks()
  mode.server = false
  values.clear()
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.stubGlobal("localStorage", { getItem, setItem, removeItem })
})
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  vi.unstubAllGlobals()
})
async function flush() {
  await act(async () => { for (let i = 0; i < 30; i++) await Promise.resolve() })
}
async function setup() {
  let current!: ReturnType<typeof useStudioController>
  function Harness() { current = useStudioController(); return <output>{current.notice?.text}</output> }
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  const client = new QueryClient({defaultOptions:{queries:{retry:false}}})
  cleanups.push(() => { act(() => root.unmount()); client.clear(); container.remove() })
  act(() => root.render(<StrictMode><QueryClientProvider client={client}><Harness /></QueryClientProvider></StrictMode>))
  await flush()
  return { get: () => current, container }
}
describe("storage recovery through the actual controller", () => {
  it.each(["", "null", "{", JSON.stringify({ ...sampleProject, dimensions: {} })])("announces a damaged save without overwriting it: %j", async (raw) => {
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
    getItem.mockImplementation(() => { throw new DOMException("private details", "SecurityError") })
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
    setItem.mockImplementation(() => { throw new DOMException("private details", "QuotaExceededError") })
    const app = await setup()
    act(() => app.get().addFurniture("chair-shell"))
    await flush()
    expect(app.get().project.furniture).toHaveLength(sampleProject.furniture.length + 1)
    expect(app.get().dirty).toBe(true)
    expect(app.container.textContent).toContain("저장 공간")
    expect(app.container.textContent).not.toContain("private details")
    expect(values.get(key)).toBe(raw)
  })
  it("does not read local project JSON in server mode", async () => {
    mode.server = true
    values.set(key, JSON.stringify({ ...sampleProject, id: "private-local-project" }))
    values.set(activeKey, "server-project")
    vi.mocked(request).mockResolvedValue({ ...sampleProject, id: "server-project" })
    const app = await setup()
    expect(getItem.mock.calls.some(([name]) => name === key)).toBe(false)
    expect(app.get().project.id).toBe("server-project")
    expect(app.get().notice).toBeNull()
  })
  it("rejects a corrupt active server ID without requesting a different project", async () => {
    mode.server = true
    values.set(activeKey, "../other-project")
    const app = await setup()
    expect(app.get().projectLoad.status).toBe("error")
    expect(request).not.toHaveBeenCalled()
    expect(values.get(activeKey)).toBe("../other-project")
  })
})
