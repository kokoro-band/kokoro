// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test"

import {
  bindSceneInteraction,
  type CursorTool,
  type SceneHit,
} from "./scene-interaction"
import { roomAtPoint } from "./house-navigation"
import { sampleProject } from "./data"

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  document.body.replaceChildren()
})

function setup(tool: CursorTool = "move") {
  const element = document.createElement("canvas")
  document.body.append(element)
  const captures = new Set<number>()
  element.setPointerCapture = (id) => {
    captures.add(id)
  }
  element.hasPointerCapture = (id) => captures.has(id)
  element.releasePointerCapture = (id) => {
    captures.delete(id)
  }
  const hit: { current: SceneHit | null } = { current: null }
  const onSelect = vi.fn()
  const onMove = vi.fn(() => true)
  const onCommit = vi.fn()
  const onToggleDoor = vi.fn()
  const onPickFloor = vi.fn()
  const interaction = bindSceneInteraction({
    element,
    initialTool: tool,
    pick: () => hit.current,
    pointAt: (event) => [event.clientX / 10, event.clientY / 10],
    onSelect,
    onMove,
    onCommit,
    onToggleDoor,
    onPickFloor,
    setCameraEnabled: () => {},
    resetCameraGesture: () => {},
  })
  cleanups.push(() => interaction.dispose())
  const pointer = (
    type: string,
    x = 100,
    y = 100,
    options: PointerEventInit = {}
  ) =>
    element.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: "mouse",
        button: 0,
        buttons: type === "pointerup" ? 0 : 1,
        isPrimary: true,
        clientX: x,
        clientY: y,
        ...options,
      })
    )
  return { hit, pointer, onSelect, onMove, onToggleDoor, onPickFloor }
}

describe("picking empty floor", () => {
  it.each(["select", "move"] as const)(
    "reports a click on empty floor with the %s tool",
    (tool) => {
      const scene = setup(tool)
      scene.pointer("pointerdown", 120, 80)
      scene.pointer("pointerup", 121, 80)
      expect(scene.onPickFloor).toHaveBeenCalledExactlyOnceWith([12.1, 8])
      expect(scene.onSelect).toHaveBeenCalledWith(null)
    }
  )

  it("does not report a drag across empty floor", () => {
    const scene = setup()
    scene.pointer("pointerdown", 120, 80)
    scene.pointer("pointermove", 160, 80)
    scene.pointer("pointerup", 160, 80)
    // Returning to the start after moving away is still a drag.
    scene.pointer("pointerdown", 120, 80)
    scene.pointer("pointermove", 160, 80)
    scene.pointer("pointermove", 120, 80)
    scene.pointer("pointerup", 120, 80)
    expect(scene.onPickFloor).not.toHaveBeenCalled()
  })

  it("leaves furniture selection, furniture drags and door toggles alone", () => {
    const scene = setup()
    scene.hit.current = { id: "chair", center: [0, 0] }
    scene.pointer("pointerdown")
    scene.pointer("pointerup")
    expect(scene.onSelect).toHaveBeenCalledWith("chair")
    scene.hit.current = { kind: "door", id: "door" }
    scene.pointer("pointerdown")
    scene.pointer("pointerup")
    expect(scene.onToggleDoor).toHaveBeenCalledWith("door")
    expect(scene.onPickFloor).not.toHaveBeenCalled()
  })

  it("ignores the pan tool, other buttons and a second pointer", () => {
    const pan = setup("pan")
    pan.pointer("pointerdown")
    pan.pointer("pointerup")
    expect(pan.onPickFloor).not.toHaveBeenCalled()
    const scene = setup()
    scene.pointer("pointerdown", 100, 100, { button: 2, buttons: 2 })
    scene.pointer("pointerup", 100, 100, { button: 2 })
    scene.pointer("pointerdown")
    scene.pointer("pointerup", 100, 100, { pointerId: 2, isPrimary: false })
    expect(scene.onPickFloor).not.toHaveBeenCalled()
  })

  it("does not treat a two-finger touch as a click on the floor", () => {
    const scene = setup()
    const touch = { pointerType: "touch" }
    scene.pointer("pointerdown", 100, 100, touch)
    scene.pointer("pointerdown", 200, 100, {
      ...touch,
      pointerId: 2,
      isPrimary: false,
    })
    scene.pointer("pointerup", 200, 100, {
      ...touch,
      pointerId: 2,
      isPrimary: false,
    })
    scene.pointer("pointerup", 100, 100, touch)
    expect(scene.onPickFloor).not.toHaveBeenCalled()
  })
})

describe("roomAtPoint", () => {
  const rooms = sampleProject.room!.rooms
  it("finds the room under a floor point and nothing outside every room", () => {
    expect(rooms[roomAtPoint(rooms, 1, 5)].name).toBe("안방")
    expect(rooms[roomAtPoint(rooms, 4.8, 4.5)].name).toBe("거실")
    expect(roomAtPoint(rooms, 9, 5.5)).toBe(-1)
  })
})
