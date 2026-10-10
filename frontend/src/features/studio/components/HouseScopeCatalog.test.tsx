// @vitest-environment happy-dom
import {
  act,
  createRef,
  StrictMode,
  useEffect,
  useImperativeHandle,
  useState,
} from "react"
import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { SnackbarProvider } from "seed-design/ui/snackbar"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { ArrangeView } from "./ArrangeView"
import { useStudioController } from "../hooks/useStudioController"
import { catalog, sampleProject } from "../data"
import { placementIssues } from "../placement-issues"
import type { Project } from "../types"

// Only the WebGL scene boundary is replaced. UI, controller and storage are real.
vi.mock("./SceneEditor", () => ({ SceneEditor: () => <div>3D 경계</div> }))
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
})

async function setup() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  localStorage.setItem(
    "kokoro-remodel-project-v1",
    JSON.stringify({ ...sampleProject, id: "house-test" })
  )
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const controller = createRef<ReturnType<typeof useStudioController>>()
  const roomIndex: { current: number | null } = { current: null }
  function Harness() {
    const studio = useStudioController()
    useImperativeHandle(controller, () => studio)
    const [index, setIndex] = useState<number | null>(null)
    useEffect(() => {
      roomIndex.current = index
    }, [index])
    return (
      <ArrangeView
        studio={studio}
        roomIndex={index}
        isMobile={false}
        onRoomChange={setIndex}
        onOpenStructure={() => {}}
      />
    )
  }
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  cleanups.push(async () => {
    await act(async () => root.unmount())
    client.clear()
    container.remove()
  })
  await act(async () =>
    root.render(
      <StrictMode>
        <QueryClientProvider client={client}>
          <SnackbarProvider>
            <Harness />
          </SnackbarProvider>
        </QueryClientProvider>
      </StrictMode>
    )
  )
  const navigator = () =>
    container.querySelector<HTMLElement>('[aria-label="방과 가구"]')!
  function button(name: string) {
    const target = [
      ...navigator().querySelectorAll<HTMLButtonElement>("button"),
    ].find(
      (item) =>
        (item.getAttribute("aria-label") ?? item.textContent?.trim()) === name
    )
    if (!target) throw new Error(`Missing button: ${name}`)
    return target
  }
  return {
    container,
    navigator,
    button,
    controller,
    roomIndex: () => roomIndex.current,
    click: (name: string) => act(async () => button(name).click()),
    placed: () => [
      ...navigator().querySelectorAll<HTMLButtonElement>("[data-furniture-id]"),
    ],
    saved: () =>
      JSON.parse(localStorage.getItem("kokoro-remodel-project-v1")!) as Project,
  }
}

describe("catalogue and furniture list in the whole-house view", () => {
  it("still starts on the room list and enters a room from it", async () => {
    const ui = await setup()
    expect(ui.navigator().textContent).toContain("꾸밀 방을 고르세요")
    const living = [
      ...ui
        .navigator()
        .querySelectorAll<HTMLButtonElement>(".room-list button"),
    ].find((item) => item.textContent?.startsWith("거실"))!
    await act(async () => living.click())
    expect(ui.roomIndex()).toBe(
      sampleProject.room!.rooms.findIndex((room) => room.name === "거실")
    )
  })

  it("adds from the catalogue without entering a room, on free floor", async () => {
    const ui = await setup()
    await ui.click("가구 추가")
    const add = ui
      .navigator()
      .querySelectorAll<HTMLButtonElement>('button[aria-label$="집에 놓기"]')
    expect(add).toHaveLength(catalog.length)
    await ui.click("셸 체어 집에 놓기")
    expect(ui.roomIndex()).toBeNull()
    const furniture = ui.saved().furniture
    expect(furniture).toHaveLength(5)
    expect(placementIssues(ui.saved())).toEqual([])
    expect(ui.controller.current!.selectedId).toBe(furniture[4].id)
    expect(
      ui.container.querySelector(".inspector-identity")?.textContent
    ).toContain("셸 체어")
  })

  it("lists every placed item with its room and selects it from the list", async () => {
    const ui = await setup()
    await ui.click("배치한 가구 4")
    expect(ui.placed().map((item) => item.dataset.furnitureId)).toEqual(
      sampleProject.furniture.map((item) => item.id)
    )
    for (const item of ui.placed()) {
      expect(item.closest("li")!.textContent).toContain("거실")
      expect(item.getAttribute("aria-description")).toBe("거실")
    }
    const chair = ui
      .placed()
      .find((item) => item.textContent?.includes("셸 체어"))!
    await act(async () => chair.click())
    expect(ui.roomIndex()).toBeNull()
    expect(ui.controller.current!.selectedId).toBe("chair-01")
    expect(chair.getAttribute("aria-pressed")).toBe("true")
  })
})
