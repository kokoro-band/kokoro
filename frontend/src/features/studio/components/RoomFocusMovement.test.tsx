// @vitest-environment happy-dom
import {
  act,
  useEffect,
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
import type { Furniture, Project, RoomLabel } from "../types"

type SceneProps = {
  furniture: Furniture[]
  focusRoom: RoomLabel | null
  onMove: (id: string, x: number, z: number) => boolean
  onMoveEnd: () => void
}
const scene: { current: SceneProps | null } = { current: null }

// Only WebGL is replaced. The scene editor, controller and storage are real.
vi.mock("../RoomScene", () => ({
  RoomScene: (props: SceneProps) => {
    scene.current = props
    return <output aria-label="장면 입력" />
  },
}))
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
  localStorage.clear()
  scene.current = null
  vi.unstubAllGlobals()
})

const rooms = sampleProject.room!.rooms
const living = rooms.findIndex((room) => room.name === "거실")
const kitchen = rooms.findIndex((room) => room.name === "주방 · 식당")

async function setup(initialRoom: number | null = living) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  localStorage.setItem(
    "kokoro-remodel-project-v1",
    JSON.stringify({ ...sampleProject, id: "focus-test" })
  )
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const controller = createRef<ReturnType<typeof useStudioController>>()
  const roomIndex = { current: initialRoom }
  function Harness() {
    const studio = useStudioController()
    useImperativeHandle(controller, () => studio)
    const [index, setIndex] = useState<number | null>(initialRoom)
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
  await act(async () => vi.dynamicImportSettled())
  function button(name: string) {
    const target = [
      ...container.querySelectorAll<HTMLButtonElement>("button"),
    ].find(
      (item) =>
        (item.getAttribute("aria-label") ?? item.textContent?.trim()) === name
    )
    if (!target) throw new Error(`Missing button: ${name}`)
    return target
  }
  function input(name: string) {
    const target = [
      ...container.querySelectorAll<HTMLInputElement>("input"),
    ].find(
      (item) =>
        document.getElementById(item.getAttribute("aria-labelledby") ?? "")
          ?.textContent === name
    )
    if (!target) throw new Error(`Missing input: ${name}`)
    return target
  }
  async function commit(name: string, value: string) {
    const target = input(name)
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!.call(target, value)
      target.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await act(async () => {
      target.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      )
    })
  }
  async function select(id: string) {
    await act(async () => controller.current!.selectFurniture(id))
  }
  const saved = (id: string) =>
    (
      JSON.parse(localStorage.getItem("kokoro-remodel-project-v1")!) as Project
    ).furniture.find((item) => item.id === id)!
  return {
    container,
    button,
    commit,
    select,
    saved,
    controller,
    roomIndex: () => roomIndex.current,
    click: (name: string) => act(async () => button(name).click()),
    enter: (name: string) =>
      act(async () =>
        [...container.querySelectorAll<HTMLButtonElement>(".room-list button")]
          .find((item) => item.textContent?.startsWith(name))!
          .click()
      ),
  }
}

describe("room focus is a view, not a movement boundary", () => {
  it("moves a typed position across a room edge that has no wall, same as in the whole house", async () => {
    const house = await setup(null)
    await house.select("chair-01")
    await house.commit("세로", "1.5")
    const expected = house.saved("chair-01")
    expect(expected.z).toBe(1.5)
    for (const cleanup of cleanups.splice(0)) await cleanup()
    localStorage.clear()

    const focused = await setup(living)
    await focused.select("chair-01")
    await focused.commit("세로", "1.5")
    expect(focused.saved("chair-01")).toEqual(expected)
  })

  it("follows the furniture into the room it was moved to and keeps it selected", async () => {
    const ui = await setup(living)
    await ui.select("chair-01")
    await ui.commit("세로", "1.5")
    expect(ui.roomIndex()).toBe(kitchen)
    expect(ui.controller.current!.selectedId).toBe("chair-01")
    expect(
      ui.container.querySelector(".inspector-identity")?.textContent
    ).toContain("셸 체어")
    expect(scene.current!.focusRoom?.name).toBe("주방 · 식당")
    expect(scene.current!.furniture.map((item) => item.id)).toContain(
      "chair-01"
    )
  })

  it("keeps a dragged item on the canvas while it crosses into another room and follows it on drop", async () => {
    const ui = await setup(living)
    await ui.select("chair-01")
    await act(async () => {
      expect(scene.current!.onMove("chair-01", 4.5, 1.5)).toBe(true)
    })
    // Mid-drag the view must not change, and the item must stay drawn.
    expect(ui.roomIndex()).toBe(living)
    expect(scene.current!.furniture.map((item) => item.id)).toContain(
      "chair-01"
    )
    await act(async () => scene.current!.onMoveEnd())
    expect(ui.saved("chair-01").z).toBe(1.5)
    expect(ui.roomIndex()).toBe(kitchen)
    expect(ui.controller.current!.selectedId).toBe("chair-01")
    await act(async () => ui.controller.current!.undo())
    expect(ui.saved("chair-01").z).toBe(3)
  })

  it("follows an arrow-key nudge that carries the item into the next room", async () => {
    const ui = await setup(living)
    await ui.select("chair-01")
    await act(async () => {
      document.body.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowUp",
          code: "ArrowUp",
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        })
      )
    })
    expect(ui.roomIndex()).toBe(living)
    await act(async () => {
      document.body.dispatchEvent(
        new KeyboardEvent("keyup", {
          key: "ArrowUp",
          code: "ArrowUp",
          bubbles: true,
        })
      )
    })
    expect(ui.saved("chair-01").z).toBe(2.5)
    expect(ui.roomIndex()).toBe(kitchen)
    expect(ui.controller.current!.selectedId).toBe("chair-01")
  })

  it("keeps the selection when the scope changes and the item is still shown", async () => {
    const ui = await setup(living)
    await ui.select("chair-01")
    await ui.click("집 전체로 돌아가기")
    expect(ui.roomIndex()).toBeNull()
    expect(ui.controller.current!.selectedId).toBe("chair-01")
    // Entering the item's own room keeps it; another room does not show it.
    await ui.enter("거실")
    expect(ui.controller.current!.selectedId).toBe("chair-01")
    await ui.click("집 전체로 돌아가기")
    await ui.enter("안방")
    expect(ui.controller.current!.selectedId).toBeNull()
  })

  it("says the item met a wall or the house outline, not a room boundary", async () => {
    const ui = await setup(living)
    await ui.select("chair-01")
    // A real wall separates the living room from the bedroom on the left.
    await ui.commit("가로", "0.1")
    expect(ui.roomIndex()).toBe(living)
    const status = ui.container.querySelector(
      '[aria-labelledby="position-title"] [role="status"]'
    )!.textContent
    expect(status).toContain("벽이나 집 바깥 경계")
    expect(status).not.toContain("거실")
  })
})
