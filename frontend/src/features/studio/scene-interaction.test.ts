// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { PerspectiveCamera, MOUSE, TOUCH } from "three"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"

import { bindSceneInteraction, type CursorTool } from "./scene-interaction"

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  document.body.replaceChildren()
})

function setup(tool: CursorTool = "move") {
  const element = document.createElement("canvas")
  document.body.append(element)
  Object.defineProperties(element, {
    clientWidth: { value: 600 },
    clientHeight: { value: 400 },
  })
  const captures = new Set<number>()
  element.setPointerCapture = (id) => {
    captures.add(id)
  }
  element.hasPointerCapture = (id) => captures.has(id)
  element.releasePointerCapture = (id) => {
    captures.delete(id)
  }
  const camera = new PerspectiveCamera(40, 1.5, 0.1, 100)
  camera.position.set(0, 10, 10)
  // Match production registration order: OrbitControls binds first, then our
  // capture listener must prevent it from starting a competing gesture.
  const controls = new OrbitControls(camera, element)
  controls.enableDamping = false
  controls.mouseButtons.LEFT = MOUSE.PAN
  controls.mouseButtons.RIGHT = MOUSE.ROTATE
  controls.touches.ONE = TOUCH.PAN
  const pick = vi.fn(() => ({
    id: "chair",
    center: [0, 0] as [number, number],
  }))
  const onSelect = vi.fn()
  const onMove = vi.fn(() => true)
  const onCommit = vi.fn()
  const interaction = bindSceneInteraction({
    element,
    initialTool: tool,
    pick,
    pointAt: (event) => [event.clientX / 10, event.clientY / 10],
    onSelect,
    onMove,
    onCommit,
    setCameraEnabled: (enabled) => {
      controls.enabled = enabled
    },
    resetCameraGesture: () => {
      controls.disconnect()
      controls.connect(element)
    },
  })
  cleanups.push(() => {
    interaction.dispose()
    controls.dispose()
  })
  const pointer = (
    type: string,
    x = 100,
    y = 100,
    options: PointerEventInit = {}
  ) => {
    const event = new PointerEvent(type, {
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
    element.dispatchEvent(event)
  }
  const position = () => [
    ...camera.position.toArray(),
    ...camera.quaternion.toArray(),
    ...controls.target.toArray(),
  ]
  return {
    element,
    captures,
    camera,
    controls,
    interaction,
    pointer,
    pick,
    onSelect,
    onMove,
    onCommit,
    position,
  }
}

describe("scene gesture ownership", () => {
  it("moves furniture with grip offset but never starts OrbitControls", () => {
    const s = setup()
    const before = s.position()
    s.pointer("pointerdown")
    s.pointer("pointermove", 101, 101)
    expect(s.onMove).not.toHaveBeenCalled()
    s.pointer("pointermove", 120, 130)
    expect(s.onMove).toHaveBeenCalledWith("chair", [2, 3])
    s.pointer("pointerup", 120, 130)
    s.controls.update()
    expect(s.position()).toEqual(before)
    expect(s.onCommit).toHaveBeenCalledTimes(1)
    expect(s.captures.size).toBe(0)
  })

  it("selects without moving furniture or camera", () => {
    const s = setup("select")
    const before = s.position()
    s.pointer("pointerdown")
    s.pointer("pointermove", 160, 140)
    s.pointer("pointerup")
    expect(s.onSelect).toHaveBeenCalledWith("chair")
    expect(s.onMove).not.toHaveBeenCalled()
    expect(s.onCommit).not.toHaveBeenCalled()
    expect(s.position()).toEqual(before)
  })

  it("does not move the camera when dragging empty space in furniture mode", () => {
    const s = setup()
    s.pick.mockReturnValue(null!)
    const before = s.position()
    s.pointer("pointerdown")
    s.pointer("pointermove", 170, 180)
    s.pointer("pointerup")
    expect(s.onSelect).toHaveBeenCalledWith(null)
    expect(s.onMove).not.toHaveBeenCalled()
    expect(s.position()).toEqual(before)
  })

  it("pans the real camera over furniture without selecting or moving it", () => {
    const s = setup("pan")
    const before = s.position()
    s.pointer("pointerdown")
    s.pointer("pointermove", 160, 140)
    s.pointer("pointerup", 160, 140)
    expect(s.position()).not.toEqual(before)
    expect(s.pick).not.toHaveBeenCalled()
    expect(s.onSelect).not.toHaveBeenCalled()
    expect(s.onMove).not.toHaveBeenCalled()
  })

  it("rotates with the right button only in camera mode", () => {
    const s = setup("pan")
    const before = s.camera.quaternion.clone()
    s.pointer("pointerdown", 100, 100, { button: 2, buttons: 2 })
    s.pointer("pointermove", 170, 150, { button: 2, buttons: 2 })
    s.pointer("pointerup", 170, 150, { button: 2 })
    expect(s.camera.quaternion.equals(before)).toBe(false)
    s.interaction.setTool("move")
    const after = s.position()
    s.pointer("pointerdown", 100, 100, { button: 2, buttons: 2 })
    s.pointer("pointermove", 170, 150, { button: 2, buttons: 2 })
    s.pointer("pointerup", 170, 150, { button: 2 })
    expect(s.position()).toEqual(after)
    expect(s.onMove).not.toHaveBeenCalled()
  })

  it.each(["blur", "pointercancel", "lostpointercapture"])(
    "releases camera captures on %s",
    (end) => {
      const s = setup("pan")
      s.pointer("pointerdown")
      s.pointer("pointermove", 130, 130)
      if (end === "blur") window.dispatchEvent(new Event("blur"))
      else s.pointer(end)
      expect(s.captures.size).toBe(0)
      const before = s.position()
      s.pointer("pointermove", 160, 160)
      expect(s.position()).toEqual(before)
      s.pointer("pointerdown", 160, 160)
      s.pointer("pointermove", 180, 180)
      expect(s.position()).not.toEqual(before)
    }
  )

  it("preserves the camera across a tool switch and does not resume an old drag", () => {
    const s = setup("pan")
    s.pointer("pointerdown")
    s.pointer("pointermove", 150, 150)
    const before = s.position()
    s.interaction.setTool("move")
    expect(s.captures.size).toBe(0)
    s.pointer("pointermove", 180, 180)
    s.interaction.setTool("pan")
    s.controls.update()
    s.pointer("pointermove", 210, 210)
    s.position().forEach((value, index) =>
      expect(value).toBeCloseTo(before[index], 10)
    )
    s.pointer("pointerdown", 210, 210)
    s.pointer("pointermove", 230, 230)
    expect(s.position()).not.toEqual(before)
  })

  it("ignores a second touch when moving furniture", () => {
    const s = setup()
    s.pointer("pointerdown", 100, 100, { pointerType: "touch" })
    s.pointer("pointerdown", 110, 110, {
      pointerType: "touch",
      pointerId: 2,
      isPrimary: false,
    })
    s.pointer("pointermove", 150, 150, { pointerId: 2, isPrimary: false })
    s.pointer("pointercancel", 150, 150, { pointerId: 2, isPrimary: false })
    s.pointer("pointerup", 150, 150, { pointerId: 2, isPrimary: false })
    expect(s.onMove).not.toHaveBeenCalled()
    expect(s.onCommit).not.toHaveBeenCalled()
    s.pointer("pointermove", 120, 120)
    s.pointer("pointerup")
    expect(s.onCommit).toHaveBeenCalledTimes(1)
  })

  it.each(["pointercancel", "lostpointercapture", "blur", "Escape", "switch"])(
    "finishes exactly once on %s and accepts the next gesture",
    (end) => {
      const s = setup()
      s.pointer("pointerdown")
      s.pointer("pointermove", 140, 140)
      if (end === "blur") window.dispatchEvent(new Event("blur"))
      else if (end === "Escape")
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
      else if (end === "switch") s.interaction.setTool("select")
      else s.pointer(end)
      s.pointer("pointerup")
      expect(s.onCommit).toHaveBeenCalledTimes(1)
      expect(s.captures.size).toBe(0)
      s.interaction.setTool("move")
      s.pointer("pointerdown")
      s.pointer("pointermove", 160, 160)
      s.pointer("pointerup")
      expect(s.onCommit).toHaveBeenCalledTimes(2)
    }
  )

  it("does not commit a click or a rejected placement", () => {
    const s = setup()
    s.onMove.mockReturnValue(false)
    s.pointer("pointerdown")
    s.pointer("pointermove", 130, 130)
    s.pointer("pointerup")
    expect(s.onCommit).not.toHaveBeenCalled()
  })
})
