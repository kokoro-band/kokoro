// @vitest-environment happy-dom
import {
  act,
  createRef,
  StrictMode,
  useImperativeHandle,
  useState,
} from "react"
import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { SnackbarProvider } from "seed-design/ui/snackbar"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { ArrangeView } from "./ArrangeView"
import { useStudioController } from "../hooks/useStudioController"
import { sampleProject } from "../data"
import type { Project } from "../types"

const scene: { select: ((id: string | null) => void) | null } = { select: null }

// Only the WebGL scene boundary is replaced. UI, controller and storage are real.
vi.mock("./SceneEditor", () => ({
  SceneEditor: ({ onSelect }: { onSelect: (id: string | null) => void }) => (
    <button
      type="button"
      aria-label="장면"
      ref={() => {
        scene.select = onSelect
      }}
    />
  ),
}))
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
  localStorage.clear()
  scene.select = null
  vi.unstubAllGlobals()
})

const living = sampleProject.room!.rooms.findIndex(
  (room) => room.name === "거실"
)

async function setup() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  localStorage.setItem(
    "kokoro-remodel-project-v1",
    JSON.stringify({ ...sampleProject, id: "mobile-test" })
  )
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const controller = createRef<ReturnType<typeof useStudioController>>()
  function Harness() {
    const studio = useStudioController()
    useImperativeHandle(controller, () => studio)
    const [index, setIndex] = useState<number | null>(living)
    return (
      <ArrangeView
        studio={studio}
        roomIndex={index}
        isMobile
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
  function button(name: string, root: ParentNode = document) {
    const target = [...root.querySelectorAll<HTMLButtonElement>("button")].find(
      (item) =>
        (item.getAttribute("aria-label") ?? item.textContent?.trim()) === name
    )
    if (!target) throw new Error(`Missing button: ${name}`)
    return target
  }
  const bar = () =>
    container.querySelector<HTMLElement>('[aria-label="선택한 가구 빠른 도구"]')
  /** The open modal sheet, if any. A closed sheet may linger while it animates. */
  const sheet = () =>
    document.querySelector<HTMLElement>('[role="dialog"][data-open]')
  return {
    container,
    button,
    bar,
    sheet,
    controller,
    click: (name: string, root?: ParentNode) =>
      act(async () => button(name, root).click()),
    selectOnCanvas: (id: string | null) => act(async () => scene.select!(id)),
    saved: () =>
      JSON.parse(localStorage.getItem("kokoro-remodel-project-v1")!) as Project,
  }
}

describe("mobile furniture selection", () => {
  it("shows a compact bar instead of covering the canvas when furniture is picked", async () => {
    const ui = await setup()
    expect(ui.bar()).toBeNull()
    await ui.selectOnCanvas("chair-01")
    expect(ui.sheet()).toBeNull()
    const bar = ui.bar()!
    expect(bar.textContent).toContain("셸 체어")
    // The canvas stays reachable: nothing modal hides it from assistive tech.
    const canvas = ui.button("장면")
    expect(canvas.closest('[aria-hidden="true"],[inert]')).toBeNull()
    expect(document.querySelector('[aria-modal="true"]')).toBeNull()
    for (const name of ["90도 돌리기", "자세히", "가구 빼기", "선택 해제"])
      expect(ui.button(name, bar).disabled).toBe(false)
  })

  it("closes the catalogue and shows the bar for furniture that was just added", async () => {
    const ui = await setup()
    await ui.click("가구 놓기")
    expect(ui.sheet()).not.toBeNull()
    await ui.click("올리브 화분 거실에 놓기")
    expect(ui.sheet()).toBeNull()
    expect(ui.saved().furniture).toHaveLength(5)
    expect(ui.bar()!.textContent).toContain("올리브 화분")
  })

  it("opens the full inspector only on request", async () => {
    const ui = await setup()
    await ui.selectOnCanvas("chair-01")
    await ui.click("자세히", ui.bar()!)
    const sheet = ui.sheet()!
    expect(sheet.textContent).toContain("위치")
    expect(sheet.querySelector('[role="slider"]')).not.toBeNull()
  })

  it("turns, removes and deselects from the bar", async () => {
    const ui = await setup()
    await ui.selectOnCanvas("table-01")
    await ui.click("90도 돌리기", ui.bar()!)
    expect(
      ui.saved().furniture.find((item) => item.id === "table-01")!.rotation
    ).toBe(90)
    await ui.click("선택 해제", ui.bar()!)
    expect(ui.bar()).toBeNull()
    expect(ui.controller.current!.selectedId).toBeNull()
    await ui.selectOnCanvas("plant-01")
    await ui.click("가구 빼기", ui.bar()!)
    expect(ui.saved().furniture.map((item) => item.id)).not.toContain(
      "plant-01"
    )
    expect(ui.bar()).toBeNull()
  })
})
