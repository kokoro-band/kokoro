// @vitest-environment happy-dom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterAll, afterEach, describe, expect, it, vi } from "vite-plus/test"
import App from "./App"
import { sampleProject } from "./features/studio/data"
import { makeFurniture } from "./features/studio/project-api"
import { buildRoomModel } from "./features/studio/room-builder"
import type { Project } from "./features/studio/types"

vi.hoisted(() => vi.stubEnv("VITE_API_MODE", "local"))
vi.mock("./lib/use-media-query", () => ({ useMediaQuery: () => false }))
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

const storageKey = "kokoro-remodel-project-v1"
const mine: Project = {
  ...structuredClone(sampleProject),
  id: "mine",
  name: "우리 집",
  dimensions: { width: 8, depth: 8, height: 2.4 },
  room: buildRoomModel({
    rooms: [{ id: "living", name: "거실", x: 0, z: 0, width: 8, depth: 8 }],
    wallHeight: 2.4,
  }),
  furniture: [makeFurniture("chair-shell", 3, 3)],
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 40; i++) await Promise.resolve()
  })
}

async function setup(saved: Project) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.stubGlobal("confirm", () => true)
  localStorage.setItem(storageKey, JSON.stringify(saved))
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
  function find(name: string) {
    return [
      ...document.querySelectorAll<HTMLElement>('button,[role="menuitem"]'),
    ].find(
      (node) =>
        !node.closest("[hidden]") &&
        (node.getAttribute("aria-label") ?? node.textContent)?.trim() === name
    )
  }
  async function click(name: string) {
    const target = find(name)
    expect(target, name).toBeDefined()
    act(() => target!.click())
    await flush()
  }
  const savedName = () =>
    (JSON.parse(localStorage.getItem(storageKey)!) as Project).name
  const dialogText = () =>
    document.querySelector('[role="dialog"]')?.textContent ?? ""
  return { click, find, savedName, dialogText }
}

describe("replacing the only local project", () => {
  it("warns before the example replaces saved work and lets the user cancel", async () => {
    const ui = await setup(mine)
    await ui.click("우리 집 프로젝트 메뉴")
    await ui.click("예제 집 열기")
    expect(ui.dialogText()).toContain("프로젝트를 하나만 저장해요")
    expect(ui.dialogText()).toContain("우리 집")
    expect(ui.savedName()).toBe("우리 집")
    await ui.click("취소")
    expect(ui.savedName()).toBe("우리 집")
  })

  it("offers an export before replacing and replaces only after confirmation", async () => {
    const create = vi.fn(() => "blob:project")
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: create }))
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {})
    const ui = await setup(mine)
    await ui.click("우리 집 프로젝트 메뉴")
    await ui.click("예제 집 열기")
    // The app cannot open an export yet, so the copy must not promise a return.
    expect(ui.dialogText()).toContain("다시 열 수 없어요")
    expect(ui.dialogText()).not.toContain("나중에 다시 보려면")
    await ui.click("JSON으로 내보내기")
    expect(create).toHaveBeenCalled()
    expect(ui.savedName()).toBe("우리 집")
    await ui.click("바꾸기")
    expect(ui.savedName()).toBe(sampleProject.name)
  })

  it("warns before a new project replaces saved work", async () => {
    const ui = await setup(mine)
    await ui.click("우리 집 프로젝트 메뉴")
    await ui.click("새 프로젝트")
    expect(ui.dialogText()).toContain("프로젝트를 하나만 저장해요")
    await ui.click("바꾸기")
    expect(ui.dialogText()).toContain("이름을 정하면")
    expect(ui.savedName()).toBe("우리 집")
  })

  // Fixes the current result: cancelling either step keeps the saved project.
  it("keeps a clean saved project when the new-project warning is cancelled", async () => {
    const ui = await setup(mine)
    const before = localStorage.getItem(storageKey)
    await ui.click("우리 집 프로젝트 메뉴")
    await ui.click("새 프로젝트")
    await ui.click("취소")
    expect(ui.dialogText()).not.toContain("이름을 정하면")
    expect(localStorage.getItem(storageKey)).toBe(before)
    expect(ui.find("우리 집 프로젝트 메뉴")).toBeDefined()
  })

  it("opens the example directly when the saved project is the untouched example", async () => {
    const ui = await setup(structuredClone(sampleProject))
    await ui.click(`${sampleProject.name} 프로젝트 메뉴`)
    await ui.click("예제 집 열기")
    expect(ui.dialogText()).not.toContain("프로젝트를 하나만 저장해요")
  })
})
