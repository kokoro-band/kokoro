// @vitest-environment happy-dom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { PlacementIssueList } from "./PlacementIssueList"
import { sampleProject } from "../data"
import type { Furniture } from "../types"

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  vi.unstubAllGlobals()
})

const rooms = sampleProject.room!.rooms
const index = (name: string) => rooms.findIndex((room) => room.name === name)
const item = (id: string, name: string, x: number, z: number): Furniture => ({
  id,
  catalogId: "chair-shell",
  name,
  category: "의자",
  x,
  z,
  rotation: 0,
  color: "#000000",
})
// Two in the living room, two in the bedroom, one in the kitchen.
const furniture = [
  item("living-a", "거실 의자", 4.5, 4),
  item("living-b", "거실 스툴", 5, 5),
  item("bed-a", "안방 의자", 1, 4),
  item("bed-b", "안방 스툴", 2, 5),
  item("kitchen-a", "주방 의자", 4.5, 1),
]
const issues = furniture.map((entry) => ({
  furnitureId: entry.id,
  reason: "다른 가구와 겹쳐 있어요.",
}))

function setup(roomIndex: number | null, selectedId: string | null = null) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  const onSelect = vi.fn()
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  cleanups.push(() => {
    act(() => root.unmount())
    container.remove()
  })
  act(() =>
    root.render(
      <PlacementIssueList
        furniture={furniture}
        issues={issues}
        rooms={rooms}
        roomIndex={roomIndex}
        selectedId={selectedId}
        onSelect={onSelect}
      />
    )
  )
  const listed = () =>
    [...container.querySelectorAll<HTMLElement>("[data-furniture-id]")].map(
      (node) => node.dataset.furnitureId
    )
  const others = () =>
    [...container.querySelectorAll<HTMLButtonElement>("button")].find((node) =>
      node.hasAttribute("aria-expanded")
    )
  return { container, listed, others, onSelect }
}

describe("placement warnings in a focused room", () => {
  it("lists every issue in the whole-house view", () => {
    const ui = setup(null)
    expect(ui.listed()).toEqual(furniture.map((entry) => entry.id))
    expect(ui.others()).toBeUndefined()
    expect(ui.container.textContent).toContain("배치 확인 필요 5개")
  })

  it("shows only the focused room's issues and sums up the rest in one line", () => {
    const ui = setup(index("거실"))
    expect(ui.listed()).toEqual(["living-a", "living-b"])
    expect(ui.container.textContent).toContain("이 방 배치 확인 필요 2개")
    const others = ui.others()!
    expect(others.textContent).toContain("다른 방 배치 확인 필요 3개")
    expect(others.getAttribute("aria-expanded")).toBe("false")
  })

  it("opens the rest of the house on request, naming each room", () => {
    const ui = setup(index("거실"))
    act(() => ui.others()!.click())
    expect(ui.others()!.getAttribute("aria-expanded")).toBe("true")
    expect(ui.listed()).toEqual([
      "living-a",
      "living-b",
      "bed-a",
      "bed-b",
      "kitchen-a",
    ])
    const kitchen = ui.container.querySelector<HTMLElement>(
      '[data-furniture-id="kitchen-a"]'
    )!
    expect(kitchen.textContent).toContain("주방 · 식당")
    act(() => kitchen.click())
    expect(ui.onSelect).toHaveBeenCalledWith("kitchen-a")
  })

  it("keeps the selected item's issue in view even when it is in another room", () => {
    const ui = setup(index("거실"), "bed-a")
    expect(ui.listed()).toEqual(["living-a", "living-b", "bed-a"])
    expect(ui.others()!.textContent).toContain("다른 방 배치 확인 필요 2개")
  })

  it("shows just the one-line summary in a room without issues", () => {
    const ui = setup(index("현관"))
    expect(ui.listed()).toEqual([])
    expect(ui.container.textContent).not.toContain("이 방 배치 확인 필요")
    expect(ui.others()!.textContent).toContain("다른 방 배치 확인 필요 5개")
  })

  it("talks about placing furniture, not about structure work", () => {
    const ui = setup(index("거실"))
    expect(ui.container.textContent).not.toContain("구조 작업")
    expect(ui.container.textContent).toContain("위치를 바꾸거나 빼 주세요")
  })
})
