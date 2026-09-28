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
  return buildRoomModel({
    rooms: [{ id: "living", name: "거실", x: 0, z: 0, width: 4, depth: 4 }],
    wallHeight: 2.4,
  }, [])
}

function setup(room: RoomModel = fixture()) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.stubGlobal("DOMPoint", class {
    constructor(public x: number, public y: number) {}
    matrixTransform() { return { x: this.x / 10, y: this.y / 10 } }
  })
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  const apply = vi.fn<(model: RoomModel) => void>()
  const dirty = vi.fn()
  function render(active = true, saving = false) {
    act(() => root.render(<StrictMode><SnackbarProvider><StructureView room={room} active={active} saving={saving} onApply={apply} onDirtyChange={dirty} /></SnackbarProvider></StrictMode>))
  }
  render()
  cleanups.push(() => { act(() => root.unmount()); container.remove() })
  const svg = container.querySelector("svg.plan-surface")!
  Object.assign(svg, {
    getScreenCTM: () => ({ inverse: () => ({}) }),
    createSVGPoint: () => ({ x: 0, y: 0, matrixTransform() { return { x: this.x / 10, y: this.y / 10 } } }),
    setPointerCapture: vi.fn(),
    hasPointerCapture: () => false,
  })
  function button(name: string) {
    const found = [...container.querySelectorAll<HTMLButtonElement>("button")].find((item) => (item.getAttribute("aria-label") ?? item.textContent?.trim()) === name)
    if (!found) throw new Error(`Missing button: ${name}`)
    return found
  }
  function input(name: string) {
    const found = [...container.querySelectorAll<HTMLInputElement>("input")].find((item) => document.getElementById(item.getAttribute("aria-labelledby") ?? "")?.textContent === name)
    if (!found) throw new Error(`Missing input: ${name}`)
    return found
  }
  function click(name: string) { act(() => button(name).click()) }
  function key(target: Element, key: string) {
    act(() => { target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })) })
  }
  function pointer(target: Element, type: string, x: number, y: number) {
    act(() => { target.dispatchEvent(new PointerEvent(type, { clientX: x * 10, clientY: y * 10, pointerId: 1, isPrimary: true, button: 0, bubbles: true, cancelable: true })) })
  }
  function type(name: string, value: string) {
    const target = input(name)
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(target, value)
      target.dispatchEvent(new Event("input", { bubbles: true }))
    })
  }
  function topWall() {
    const found = [...svg.querySelectorAll("line.plan-wall")].find((line) => line.getAttribute("y1") === "0" && line.getAttribute("y2") === "0")
    if (!found) throw new Error("Missing top wall")
    return found
  }
  return { container, svg, apply, dirty, render, button, input, click, key, pointer, type, topWall }
}

describe("StructureView real UI transactions", () => {
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
    const top = initial.walls.find((wall) => wall.a[1] === 0 && wall.b[1] === 0)!
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
