// @vitest-environment happy-dom
import { act, useState } from "react"
import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { SnackbarProvider } from "seed-design/ui/snackbar"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { ArrangeView } from "./ArrangeView"
import { useStudioController } from "../hooks/useStudioController"
import { sampleProject } from "../data"
import { placementIssues } from "../placement-issues"
import type { Furniture, Point2, Project } from "../types"

// Only WebGL is replaced. The scene editor, controller and storage are real.
const scene: { forward: { current: Point2 } | null } = { forward: null }
vi.mock("../RoomScene", () => ({
  RoomScene: (props: { viewForwardRef: { current: Point2 } }) => {
    scene.forward = props.viewForwardRef
    return <output aria-label="장면 입력" />
  },
}))
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
  localStorage.clear()
  scene.forward = null
  vi.unstubAllGlobals()
})

const living = sampleProject.room!.rooms.findIndex(
  (room) => room.name === "거실"
)
const chair: Furniture = {
  ...sampleProject.furniture.find((item) => item.id === "chair-01")!,
  x: 4.537,
  z: 3.013,
  rotation: 0,
}

async function setup(furniture: Furniture[] = [chair]) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  localStorage.setItem(
    "kokoro-remodel-project-v1",
    JSON.stringify({ ...sampleProject, id: "keyboard-test", furniture })
  )
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  function Harness() {
    const studio = useStudioController()
    const [index, setIndex] = useState<number | null>(living)
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
      <QueryClientProvider client={client}>
        <SnackbarProvider>
          <Harness />
        </SnackbarProvider>
      </QueryClientProvider>
    )
  )
  await act(async () => vi.dynamicImportSettled())
  const find = <T extends HTMLElement>(selector: string, text = "") => {
    const target = [...container.querySelectorAll<T>(selector)].find((item) =>
      (item.getAttribute("aria-label") ?? item.textContent ?? "").includes(text)
    )
    if (!target) throw new Error(`Missing ${selector} ${text}`)
    return target
  }
  const click = (selector: string, text = "") =>
    act(async () => find(selector, text).click())
  const press = (
    target: Element,
    type: "keydown" | "keyup",
    code: string,
    extra: KeyboardEventInit = {}
  ) =>
    act(async () => {
      target.dispatchEvent(
        new KeyboardEvent(type, {
          key: code,
          code,
          bubbles: true,
          cancelable: true,
          ...extra,
        })
      )
    })
  /** Chooses the chair in the placed-furniture list, as a keyboard user does. */
  async function choose() {
    await click('[role="tab"]', "배치한 가구")
    const item = find<HTMLButtonElement>('[data-furniture-id="chair-01"]')
    item.focus()
    await act(async () => item.click())
    expect(item.getAttribute("aria-pressed")).toBe("true")
    return item
  }
  const project = () =>
    JSON.parse(localStorage.getItem("kokoro-remodel-project-v1")!) as Project
  const saved = () =>
    project().furniture.find((item) => item.id === "chair-01")!
  return { container, find, click, press, choose, project, saved }
}

describe("keyboard furniture editing", () => {
  it("selects from the list, saves held arrow moves and restores them with one undo", async () => {
    const ui = await setup()
    const item = await ui.choose()
    await ui.press(item, "keydown", "ArrowRight")
    await ui.press(item, "keydown", "ArrowRight", { repeat: true })
    await ui.press(item, "keydown", "ArrowRight", { repeat: true })
    // Nothing is saved while the key is held.
    expect(ui.saved().x).toBe(chair.x)
    await ui.press(item, "keyup", "ArrowRight")
    expect(ui.saved().x).toBeCloseTo(chair.x + 0.3, 9)
    await ui.press(item, "keydown", "ArrowDown", { shiftKey: true })
    await ui.press(item, "keyup", "ArrowDown")
    expect(ui.saved().z).toBeCloseTo(chair.z + 0.5, 9)
    await ui.click("button", "실행 취소")
    expect(ui.saved().z).toBe(chair.z)
    expect(ui.saved().x).toBeCloseTo(chair.x + 0.3, 9)
    await ui.click("button", "실행 취소")
    expect(ui.saved()).toEqual(chair)
  })

  it("moves exactly 0.1 m from a position that is off the 0.1 m grid", async () => {
    const ui = await setup()
    const item = await ui.choose()
    await ui.press(item, "keydown", "ArrowLeft")
    await ui.press(item, "keyup", "ArrowLeft")
    expect(ui.saved().x).toBeCloseTo(chair.x - 0.1, 9)
    // The other axis is not pulled onto the grid either.
    expect(ui.saved().z).toBe(chair.z)
    await ui.press(item, "keydown", "ArrowUp")
    await ui.press(item, "keyup", "ArrowUp")
    expect(ui.saved().z).toBeCloseTo(chair.z - 0.1, 9)
  })

  it("steps through another item like an internal wall and warns about the overlap", async () => {
    const block: Furniture = { ...chair, id: "block", x: chair.x + 0.9 }
    const ui = await setup([chair, block])
    const item = await ui.choose()
    await ui.press(item, "keydown", "ArrowRight", { shiftKey: true })
    await ui.press(item, "keyup", "ArrowRight")
    expect(ui.saved().x).toBeCloseTo(chair.x + 0.5, 9)
    expect(placementIssues(ui.project())[0].reason).toContain("겹쳐")
    await ui.press(item, "keydown", "ArrowRight", { shiftKey: true })
    await ui.press(item, "keydown", "ArrowRight", { shiftKey: true })
    await ui.press(item, "keyup", "ArrowRight")
    expect(ui.saved().x).toBeCloseTo(chair.x + 1.5, 9)
  })

  it("moves the way the arrows point on screen after the 3D view is turned", async () => {
    const ui = await setup()
    const item = await ui.choose()
    // The camera now looks along the plan's width, from the left side.
    scene.forward!.current = [1, 0]
    await ui.press(item, "keydown", "ArrowUp")
    await ui.press(item, "keyup", "ArrowUp")
    expect(ui.saved().x).toBeCloseTo(chair.x + 0.1, 9)
    expect(ui.saved().z).toBe(chair.z)
    await ui.press(item, "keydown", "ArrowRight")
    await ui.press(item, "keyup", "ArrowRight")
    expect(ui.saved().z).toBeCloseTo(chair.z + 0.1, 9)
  })

  // 현재 결과를 고정하는 테스트: 방향키를 스스로 쓰는 위젯은 가구를 옮기지 않습니다.
  it("leaves the furniture where it is when arrows are pressed in a field, slider, tab or dialog", async () => {
    const ui = await setup()
    await ui.choose()
    const dialog = document.createElement("div")
    dialog.setAttribute("role", "dialog")
    dialog.append(document.createElement("button"))
    ui.container.append(dialog)
    const field = ui.find("input")
    for (const target of [
      field,
      ui.find('[role="slider"]'),
      ui.find('[role="tab"]'),
      dialog.firstElementChild!,
    ]) {
      for (const code of ["ArrowLeft", "ArrowRight"]) {
        await ui.press(target, "keydown", code)
        await ui.press(target, "keyup", code)
      }
    }
    expect(ui.saved().x).toBe(chair.x)
    expect(ui.saved().z).toBe(chair.z)
    // The width field steps its own value. It is not a move down the plan.
    await ui.press(field, "keydown", "ArrowDown")
    await ui.press(field, "keyup", "ArrowDown")
    expect(ui.saved().x).toBeCloseTo(4.4, 9)
    expect(ui.saved().z).toBe(chair.z)
  })
})
