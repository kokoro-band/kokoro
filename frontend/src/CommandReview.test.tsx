// @vitest-environment happy-dom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, afterAll, expect, it, vi } from "vite-plus/test"
import App from "./App"
import { sampleProject } from "./features/studio/data"
import { makeFurniture } from "./features/studio/project-api"
import type { Project } from "./features/studio/types"

vi.hoisted(() => vi.stubEnv("VITE_API_MODE", "local"))
vi.mock("./features/studio/components/SceneEditor", () => ({
  SceneEditor: () => <div>WebGL 경계</div>,
}))
const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  localStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
afterAll(() => vi.unstubAllEnvs())
async function flush() {
  await act(async () => {
    for (let i = 0; i < 40; i++) await Promise.resolve()
  })
}
async function setup(furniture = sampleProject.furniture) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  const initial: Project = { ...structuredClone(sampleProject), furniture }
  localStorage.setItem("kokoro-remodel-project-v1", JSON.stringify(initial))
  const client = new QueryClient()
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  cleanups.push(() => {
    act(() => root.unmount())
    client.clear()
    container.remove()
  })
  act(() =>
    root.render(
      <QueryClientProvider client={client}>
        <App />
      </QueryClientProvider>
    )
  )
  await flush()
  function button(name: string, scope: ParentNode = document) {
    const button = [
      ...scope.querySelectorAll<HTMLButtonElement>("button"),
    ].find(
      (node) =>
        !node.closest("[hidden]") &&
        (node.getAttribute("aria-label") ?? node.textContent)?.trim() === name
    )
    expect(button, name).toBeDefined()
    return button!
  }
  async function click(name: string, scope?: ParentNode) {
    act(() => button(name, scope).click())
    await flush()
  }
  async function send(text: string) {
    if (!document.querySelector('textarea[aria-label="가구 배치 요청"]'))
      await click("AI 배치")
    const input = document.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="가구 배치 요청"]'
    )!
    act(() => {
      input.focus()
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value"
      )!.set!.call(input, text)
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await click("요청 보내기")
    return input
  }
  const saved = (): Project =>
    JSON.parse(localStorage.getItem("kokoro-remodel-project-v1")!)
  return { initial, send, click, saved }
}

it("shows a SEED confirmation with target names and cancels without changing saved furniture", async () => {
  const app = await setup()
  const input = await app.send("방을 비워줘")
  const dialog = document.querySelector(
    '[role="dialog"].seed-content-dialog__content'
  )
  expect(dialog).not.toBeNull()
  expect(dialog!.textContent).toContain("배치 변경 확인")
  expect(dialog!.textContent).toContain(app.initial.furniture[0].name)
  expect(app.saved().furniture).toEqual(app.initial.furniture)
  await app.click("취소", dialog!)
  expect(app.saved().furniture).toEqual(app.initial.furniture)
  await vi.waitFor(() => expect(document.activeElement === input).toBe(true))
})
it("applies a local clear only when the confirmation button is clicked", async () => {
  const app = await setup()
  await app.send("방을 비워줘")
  const dialog = document.querySelector(
    '[role="dialog"].seed-content-dialog__content'
  )
  expect(dialog).not.toBeNull()
  await app.click("변경 적용", dialog!)
  expect(app.saved().furniture).toEqual([])
})
it("lists same-named candidates with coordinates and changes only the selected one", async () => {
  const one = makeFurniture("chair-shell", 1, 1)
  const two = makeFurniture("chair-shell", 2, 2)
  const app = await setup([one, two])
  await app.send("의자를 창가로 옮겨줘")
  const dialog = document.querySelector(
    '[role="dialog"].seed-content-dialog__content'
  )
  expect(dialog).not.toBeNull()
  expect(dialog!.textContent).toContain("대상 가구 선택")
  expect(app.saved().furniture).toEqual([one, two])
  await app.click("2. 셸 체어 (2, 2 m)", dialog!)
  expect(app.saved().furniture[0]).toEqual(one)
  expect(app.saved().furniture[1]).not.toEqual(two)
})

it("preserves the draft after browser storage failure and retries the same local proposal", async () => {
  const app = await setup()
  await app.send("방을 비워줘")
  const storage = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
    throw new Error("저장 공간 부족")
  })
  await app.click("변경 적용")
  expect(storage).toHaveBeenCalled()
  expect(document.body.textContent).toContain("결과를 받지 못했어요")
  expect(app.saved().furniture).toEqual(app.initial.furniture)
  storage.mockRestore()
  await app.click("같은 요청 다시 확인")
  expect(app.saved().furniture).toEqual([])
})
