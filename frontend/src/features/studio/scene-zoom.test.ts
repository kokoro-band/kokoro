// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test"

import {
  bindSceneInteraction,
  type CursorTool,
  type SceneHit,
} from "./scene-interaction"

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
  const zoomCamera = vi.fn()
  const setCameraEnabled = vi.fn()
  const interaction = bindSceneInteraction({
    element,
    initialTool: tool,
    pick: () => hit.current,
    pointAt: (event) => [event.clientX / 10, event.clientY / 10],
    onSelect,
    onMove,
    onCommit,
    zoomCamera,
    setCameraEnabled,
    resetCameraGesture: () => {},
  })
  cleanups.push(() => interaction.dispose())
  const wheel = (deltaY: number, options: WheelEventInit = {}) => {
    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY,
      ...options,
    })
    element.dispatchEvent(event)
    return event
  }
  const touch = (type: string, pointerId: number, x: number, y: number) =>
    element.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId,
        pointerType: "touch",
        button: 0,
        buttons: type === "pointerup" ? 0 : 1,
        isPrimary: pointerId === 1,
        clientX: x,
        clientY: y,
      })
    )
  return {
    hit,
    interaction,
    wheel,
    touch,
    onSelect,
    onMove,
    onCommit,
    zoomCamera,
    setCameraEnabled,
  }
}

describe("zooming while editing furniture", () => {
  it.each(["select", "move"] as const)(
    "zooms with the wheel in the %s tool without handing the camera over",
    (tool) => {
      const scene = setup(tool)
      const zoomIn = scene.wheel(-100)
      expect(zoomIn.defaultPrevented).toBe(true)
      expect(scene.zoomCamera).toHaveBeenCalledTimes(1)
      expect(scene.zoomCamera.mock.calls[0][0]).toBeLessThan(1)
      scene.wheel(100)
      expect(scene.zoomCamera.mock.calls[1][0]).toBeGreaterThan(1)
      // Dragging on empty floor must still leave the camera where it is.
      expect(scene.setCameraEnabled).not.toHaveBeenCalledWith(true)
    }
  )

  it("leaves the wheel to the camera controls in the pan tool", () => {
    const scene = setup("pan")
    const event = scene.wheel(-100)
    expect(scene.zoomCamera).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it("keeps zooming with the wheel while furniture is being dragged", () => {
    const scene = setup()
    scene.hit.current = { id: "chair", center: [0, 0] }
    scene.touch("pointerdown", 1, 100, 100)
    scene.touch("pointermove", 1, 140, 100)
    scene.wheel(-100)
    scene.touch("pointermove", 1, 160, 100)
    scene.touch("pointerup", 1, 160, 100)
    expect(scene.zoomCamera).toHaveBeenCalledTimes(1)
    expect(scene.onMove).toHaveBeenCalledTimes(2)
    expect(scene.onCommit).toHaveBeenCalledTimes(1)
  })

  it("zooms with a two-finger pinch on empty floor and moves nothing", () => {
    const scene = setup()
    scene.touch("pointerdown", 1, 100, 100)
    scene.touch("pointerdown", 2, 200, 100)
    scene.touch("pointermove", 2, 300, 100)
    expect(scene.zoomCamera).toHaveBeenLastCalledWith(0.5)
    scene.touch("pointermove", 1, 200, 100)
    expect(scene.zoomCamera).toHaveBeenLastCalledWith(2)
    scene.touch("pointerup", 2, 300, 100)
    // The finger that stays down does not turn into a drag.
    scene.hit.current = { id: "chair", center: [0, 0] }
    scene.touch("pointermove", 1, 260, 160)
    scene.touch("pointerup", 1, 260, 160)
    expect(scene.onMove).not.toHaveBeenCalled()
    expect(scene.onCommit).not.toHaveBeenCalled()
  })

  it("starts a pinch from where the first finger is, not where it landed", () => {
    const scene = setup()
    scene.touch("pointerdown", 1, 100, 100)
    scene.touch("pointermove", 1, 200, 100)
    scene.touch("pointerdown", 2, 300, 100)
    scene.touch("pointermove", 1, 201, 100)
    expect(scene.zoomCamera).toHaveBeenLastCalledWith(100 / 99)
  })

  it("does not let a second finger take over a held piece of furniture", () => {
    const scene = setup()
    scene.hit.current = { id: "chair", center: [0, 0] }
    scene.touch("pointerdown", 1, 100, 100)
    scene.touch("pointerdown", 2, 200, 100)
    scene.touch("pointermove", 2, 300, 100)
    expect(scene.zoomCamera).not.toHaveBeenCalled()
    scene.touch("pointermove", 1, 140, 100)
    scene.touch("pointerup", 1, 140, 100)
    expect(scene.onCommit).toHaveBeenCalledTimes(1)
  })

  it("forgets a pinch when the tool changes", () => {
    const scene = setup()
    scene.touch("pointerdown", 1, 100, 100)
    scene.touch("pointerdown", 2, 200, 100)
    scene.interaction.setTool("select")
    scene.touch("pointermove", 2, 300, 100)
    expect(scene.zoomCamera).not.toHaveBeenCalled()
  })
})
