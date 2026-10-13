// @vitest-environment happy-dom
import { act, StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { addOpening, buildRoomModel } from "../room-builder"
import type { RoomModel } from "../types"
import { StructureView } from "./StructureView"
import { SnackbarProvider } from "seed-design/ui/snackbar"

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function fixture() {
  return buildRoomModel(
    {
      rooms: [{ id: "living", name: "거실", x: 0, z: 0, width: 4, depth: 4 }],
      wallHeight: 2.4,
    },
    []
  )
}

function setup(room: RoomModel = fixture()) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.stubGlobal(
    "DOMPoint",
    class {
      x: number
      y: number
      constructor(x: number, y: number) {
        this.x = x
        this.y = y
      }
      matrixTransform() {
        return { x: this.x / 10, y: this.y / 10 }
      }
    }
  )
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  const apply = vi.fn<(model: RoomModel) => void>()
  const dirty = vi.fn()
  function render(active = true, saving = false) {
    act(() =>
      root.render(
        <StrictMode>
          <SnackbarProvider>
            <StructureView
              room={room}
              active={active}
              saving={saving}
              onApply={apply}
              onDirtyChange={dirty}
            />
          </SnackbarProvider>
        </StrictMode>
      )
    )
  }
  render()
  cleanups.push(() => {
    act(() => root.unmount())
    container.remove()
  })
  const svg = container.querySelector("svg.plan-surface")!
  Object.assign(svg, {
    getScreenCTM: () => ({ inverse: () => ({}) }),
    createSVGPoint: () => ({
      x: 0,
      y: 0,
      matrixTransform() {
        return { x: this.x / 10, y: this.y / 10 }
      },
    }),
    setPointerCapture: vi.fn(),
    hasPointerCapture: () => false,
  })
  function button(name: string) {
    const found = [
      ...container.querySelectorAll<HTMLButtonElement>("button"),
    ].find(
      (item) =>
        (item.getAttribute("aria-label") ?? item.textContent?.trim()) === name
    )
    if (!found) throw new Error(`Missing button: ${name}`)
    return found
  }
  function input(name: string) {
    const found = [
      ...container.querySelectorAll<HTMLInputElement>("input"),
    ].find(
      (item) =>
        document.getElementById(item.getAttribute("aria-labelledby") ?? "")
          ?.textContent === name
    )
    if (!found) throw new Error(`Missing input: ${name}`)
    return found
  }
  function click(name: string) {
    act(() => button(name).click())
  }
  function key(target: Element, key: string) {
    act(() => {
      target.dispatchEvent(
        new KeyboardEvent("keydown", {
          key,
          code: key,
          bubbles: true,
          cancelable: true,
        })
      )
      target.dispatchEvent(
        new KeyboardEvent("keyup", { key, code: key, bubbles: true })
      )
    })
  }
  function pointer(target: Element, type: string, x: number, y: number) {
    act(() => {
      target.dispatchEvent(
        new PointerEvent(type, {
          clientX: x * 10,
          clientY: y * 10,
          pointerId: 1,
          isPrimary: true,
          button: 0,
          bubbles: true,
          cancelable: true,
        })
      )
    })
  }
  function type(name: string, value: string) {
    const target = input(name)
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!.call(target, value)
      target.dispatchEvent(new Event("input", { bubbles: true }))
    })
  }
  function topWall() {
    const found = [...svg.querySelectorAll("line.plan-wall")].find(
      (line) =>
        line.getAttribute("y1") === "0" && line.getAttribute("y2") === "0"
    )
    if (!found) throw new Error("Missing top wall")
    return found
  }
  return {
    container,
    svg,
    apply,
    dirty,
    render,
    button,
    input,
    click,
    key,
    pointer,
    type,
    topWall,
  }
}

describe("StructureView real UI transactions", () => {
  it("applies the visible room name and dimensions without mutating the source", () => {
    const initial = fixture()
    const ui = setup(initial)
    expect(ui.button("구조 저장").disabled).toBe(true)
    ui.type("이름", "작업실")
    ui.type("가로", "5.2")
    ui.key(ui.input("가로"), "Enter")
    expect(ui.svg.querySelector('[aria-label="작업실 선택"]')).not.toBeNull()
    expect(ui.dirty).toHaveBeenLastCalledWith(true)
    ui.click("구조 저장")
    const saved = ui.apply.mock.calls[0][0]
    expect(saved.rooms[0].name).toBe("작업실")
    expect(saved.bounds).toEqual({ width: 5.2, depth: 4 })
    expect(initial.rooms[0].name).toBe("거실")
    expect(initial.bounds.width).toBe(4)
  })

  it("reverts edits and restores the original clean structure", () => {
    const ui = setup()
    ui.type("이름", "작업실")
    ui.type("가로", "5")
    ui.key(ui.input("가로"), "Enter")
    ui.click("되돌리기")
    expect(ui.input("이름").value).toBe("거실")
    expect(ui.input("가로").value).toBe("4.0")
    expect(ui.button("구조 저장").disabled).toBe(true)
    expect(ui.dirty).toHaveBeenLastCalledWith(false)
    expect(ui.apply).not.toHaveBeenCalled()
  })

  it("splits a room and merges the shared wall with undo and redo", () => {
    const ui = setup()
    ui.click("나누기")
    ui.pointer(ui.svg.querySelector(".plan-room")!, "pointerdown", 2, 2)
    expect(ui.svg.querySelectorAll(".plan-room")).toHaveLength(2)
    ui.click("구조 저장")
    expect(ui.apply.mock.calls[0][0].rooms).toHaveLength(2)
    expect(ui.apply.mock.calls[0][0].bounds).toEqual({ width: 4, depth: 4 })
    ui.click("합치기")
    const shared = [...ui.svg.querySelectorAll(".plan-wall")].find(
      (wall) =>
        wall.getAttribute("x1") === "2" && wall.getAttribute("x2") === "2"
    )!
    ui.pointer(shared, "pointerdown", 2, 2)
    expect(ui.svg.querySelectorAll(".plan-room")).toHaveLength(1)
    ui.click("실행 취소")
    expect(ui.svg.querySelectorAll(".plan-room")).toHaveLength(2)
    ui.click("다시 실행")
    expect(ui.svg.querySelectorAll(".plan-room")).toHaveLength(1)
  })

  it.each(["door", "window"] as const)(
    "adds, resizes, moves and deletes a %s through the UI",
    (type) => {
      const ui = setup()
      ui.click("문·창")
      if (type === "window") ui.click("창")
      ui.pointer(ui.topWall(), "pointerdown", 2, 0)
      const opening = ui.svg.querySelector(".plan-opening")!
      ui.key(opening, "Enter")
      ui.type("폭", "1.2")
      ui.key(ui.input("폭"), "Enter")
      ui.type("벽 시작점에서 거리", "0.5")
      ui.key(ui.input("벽 시작점에서 거리"), "Enter")
      ui.click("구조 저장")
      expect(ui.apply.mock.calls[0][0].openings).toEqual([
        expect.objectContaining({ type, from: 0.5, to: 1.7 }),
      ])
      ui.click("삭제")
      expect(ui.svg.querySelectorAll(".plan-opening")).toHaveLength(0)
      ui.click("실행 취소")
      expect(ui.svg.querySelectorAll(".plan-opening")).toHaveLength(1)
      ui.click("다시 실행")
      expect(ui.svg.querySelectorAll(".plan-opening")).toHaveLength(0)
    }
  )

  it("keeps existing openings when changing room size", () => {
    const initial = fixture()
    const top = initial.walls.find(
      (wall) => wall.a[1] === 0 && wall.b[1] === 0
    )!
    const ui = setup(addOpening(initial, top.id, "window", 2))
    ui.type("가로", "5")
    ui.key(ui.input("가로"), "Enter")
    ui.click("구조 저장")
    const saved = ui.apply.mock.calls[0][0]
    expect(saved.bounds.width).toBe(5)
    expect(saved.openings).toHaveLength(1)
    expect(
      saved.walls.some((wall) => wall.id === saved.openings[0].wallId)
    ).toBe(true)
    expect(saved.openings[0].to - saved.openings[0].from).toBeCloseTo(1.5)
  })

  it("applies deletion of an existing opening and restores it with undo", () => {
    const initial = fixture()
    const top = initial.walls.find(
      (wall) => wall.a[1] === 0 && wall.b[1] === 0
    )!
    const ui = setup(addOpening(initial, top.id, "door", 2))
    ui.key(ui.svg.querySelector(".plan-opening")!, "Enter")
    ui.click("삭제")
    ui.click("구조 저장")
    expect(ui.apply).toHaveBeenCalledTimes(1)
    expect(ui.apply.mock.calls[0][0].openings).toEqual([])
    ui.click("실행 취소")
    expect(ui.svg.querySelectorAll(".plan-opening")).toHaveLength(1)
    expect(ui.button("구조 저장").disabled).toBe(true)
  })

  it.each(["pointercancel", "Escape"])(
    "cancels resize via %s and preserves redo",
    (cancel) => {
      const ui = setup()
      ui.type("이름", "작업실")
      ui.click("실행 취소")
      ui.pointer(
        ui.svg.querySelector('[data-handle="e"]')!,
        "pointerdown",
        4,
        2
      )
      ui.pointer(ui.svg, "pointermove", 5, 2)
      expect(ui.input("가로").value).toBe("5.0")
      expect(ui.button("구조 저장").disabled).toBe(true)
      if (cancel === "Escape") ui.key(document.body, "Escape")
      else ui.pointer(ui.svg, cancel, 5, 2)
      expect(ui.input("가로").value).toBe("4.0")
      expect(ui.button("다시 실행").disabled).toBe(false)
      ui.click("다시 실행")
      expect(ui.input("이름").value).toBe("작업실")
      expect(ui.apply).not.toHaveBeenCalled()
    }
  )

  it("commits a completed resize once and undoes the whole gesture", () => {
    const ui = setup()
    ui.pointer(ui.svg.querySelector('[data-handle="e"]')!, "pointerdown", 4, 2)
    ui.pointer(ui.svg, "pointermove", 5, 2)
    ui.pointer(ui.svg, "pointermove", 6, 2)
    ui.pointer(ui.svg, "pointerup", 6, 2)
    ui.click("구조 저장")
    expect(ui.apply.mock.calls[0][0].bounds.width).toBe(6)
    ui.click("실행 취소")
    expect(ui.input("가로").value).toBe("4.0")
    expect(ui.button("실행 취소").disabled).toBe(true)
  })

  it.each(["saving", "inactive"])("ignores canvas edits when %s", (mode) => {
    const ui = setup()
    ui.click("나누기")
    ui.render(mode !== "inactive", mode === "saving")
    ui.pointer(ui.svg.querySelector(".plan-room")!, "pointerdown", 2, 2)
    expect(ui.svg.querySelectorAll(".plan-room")).toHaveLength(1)
    expect(ui.button("실행 취소").disabled).toBe(true)
    expect(ui.apply).not.toHaveBeenCalled()
    if (mode === "saving")
      expect(ui.container.querySelector("aside")?.hasAttribute("inert")).toBe(
        true
      )
  })

  it("preserves redo when merging an exterior wall changes nothing", () => {
    const ui = setup()
    ui.type("이름", "작업실")
    ui.click("실행 취소")
    expect(ui.button("다시 실행").disabled).toBe(false)
    ui.click("합치기")
    ui.pointer(ui.topWall(), "pointerdown", 2, 0)
    expect(ui.button("실행 취소").disabled).toBe(true)
    expect(ui.button("다시 실행").disabled).toBe(false)
    ui.click("다시 실행")
    expect(ui.input("이름").value).toBe("작업실")
  })

  it("preserves redo when a new door overlaps an existing door", () => {
    const initial = fixture()
    const top = initial.walls.find(
      (wall) => wall.a[1] === 0 && wall.b[1] === 0
    )!
    const ui = setup(addOpening(initial, top.id, "door", 2))
    ui.type("이름", "작업실")
    ui.click("실행 취소")
    ui.click("문·창")
    ui.pointer(ui.topWall(), "pointerdown", 2, 0)
    expect(ui.svg.querySelectorAll(".plan-opening")).toHaveLength(1)
    expect(ui.button("실행 취소").disabled).toBe(true)
    expect(ui.button("다시 실행").disabled).toBe(false)
  })
})
