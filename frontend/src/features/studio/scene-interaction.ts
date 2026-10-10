export type CursorTool = "select" | "move" | "pan"
type Point = [x: number, z: number]
export type SceneHit =
  | { kind?: "furniture"; id: string; center: Point }
  | { kind: "door"; id: string }

/** Owns pointer gestures before OrbitControls can handle their bubbling events. */
export function bindSceneInteraction({
  element,
  initialTool,
  pick,
  pointAt,
  onSelect,
  onMove,
  onCommit,
  onToggleDoor = () => {},
  onPickFloor = () => {},
  zoomCamera = () => {},
  setCameraEnabled,
  resetCameraGesture,
}: {
  element: HTMLElement
  initialTool: CursorTool
  pick: (event: PointerEvent) => SceneHit | null
  pointAt: (event: PointerEvent) => Point | null
  onSelect: (id: string | null) => void
  onMove: (id: string, point: Point) => boolean
  onCommit: () => void
  onToggleDoor?: (id: string) => void
  /** A click, not a drag, on floor that has no furniture or door on it. */
  onPickFloor?: (point: Point) => void
  /**
   * Scales the camera distance. The select and move tools keep the camera
   * controls off so a drag never pans, so their zoom gestures arrive here.
   */
  zoomCamera?: (factor: number) => void
  setCameraEnabled: (enabled: boolean) => void
  resetCameraGesture: () => void
}) {
  let tool = initialTool
  let gesture: {
    pointerId: number
    id: string
    start: [number, number]
    offset: Point
    moved: boolean
  } | null = null
  let doorGesture: {
    pointerId: number
    id: string
    start: Point
    cancelled: boolean
  } | null = null
  let floorGesture: {
    pointerId: number
    start: Point
    cancelled: boolean
  } | null = null
  const cameraPointers = new Set<number>()
  // Fingers on empty floor. Two of them pinch; held furniture is never pinched.
  const touches = new Map<number, Point>()
  const window = element.ownerDocument.defaultView

  function cursor() {
    element.style.cursor =
      gesture || cameraPointers.size
        ? "grabbing"
        : tool === "pan"
          ? "grab"
          : tool === "move"
            ? "move"
            : "default"
  }

  function release(pointerId: number) {
    if (element.hasPointerCapture(pointerId))
      element.releasePointerCapture(pointerId)
  }

  // Cancellation preserves the last preview and commits it once, so undo can
  // restore the starting position even after blur or an unexpected capture loss.
  function finishFurniture() {
    const previous = gesture
    gesture = null
    if (previous) {
      release(previous.pointerId)
      if (previous.moved) onCommit()
    }
    cursor()
  }

  function finishDoor() {
    const previous = doorGesture
    doorGesture = null
    if (previous) release(previous.pointerId)
    cursor()
  }

  function finishCamera() {
    const pointers = [...cameraPointers]
    cameraPointers.clear()
    resetCameraGesture()
    pointers.forEach(release)
    cursor()
  }

  function stop(event: Event) {
    event.preventDefault()
    event.stopImmediatePropagation()
  }

  function down(event: PointerEvent) {
    if (tool === "pan") {
      cameraPointers.add(event.pointerId)
      cursor()
      return
    }
    stop(event)
    // A second finger makes it a multi-touch gesture, never a click.
    if (!event.isPrimary) floorGesture = null
    if (event.pointerType === "touch") {
      if (event.isPrimary) touches.clear()
      if (!gesture && !doorGesture && touches.size < 2)
        touches.set(event.pointerId, [event.clientX, event.clientY])
    }
    if (gesture || doorGesture || event.button !== 0 || !event.isPrimary) return
    const hit = pick(event)
    if (hit && (hit.kind === "door" || tool === "move")) touches.clear()
    if (hit?.kind === "door") {
      doorGesture = {
        pointerId: event.pointerId,
        id: hit.id,
        start: [event.clientX, event.clientY],
        cancelled: false,
      }
      element.setPointerCapture(event.pointerId)
      element.style.cursor = "pointer"
      return
    }
    onSelect(hit?.id ?? null)
    floorGesture = hit
      ? null
      : {
          pointerId: event.pointerId,
          start: [event.clientX, event.clientY],
          cancelled: false,
        }
    if (tool !== "move" || !hit) return
    const point = pointAt(event)
    if (!point) return
    gesture = {
      pointerId: event.pointerId,
      id: hit.id,
      start: [event.clientX, event.clientY],
      offset: [hit.center[0] - point[0], hit.center[1] - point[1]],
      moved: false,
    }
    element.setPointerCapture(event.pointerId)
    cursor()
  }

  function move(event: PointerEvent) {
    if (tool === "pan") return
    stop(event)
    const touched = touches.get(event.pointerId)
    if (touched && touches.size === 2) {
      const [other] = [...touches].flatMap(([id, point]) =>
        id === event.pointerId ? [] : [point]
      )
      const before = Math.hypot(touched[0] - other[0], touched[1] - other[1])
      const after = Math.hypot(
        event.clientX - other[0],
        event.clientY - other[1]
      )
      touches.set(event.pointerId, [event.clientX, event.clientY])
      if (before > 0 && after > 0) zoomCamera(before / after)
      return
    }
    if (doorGesture) {
      if (
        event.pointerId === doorGesture.pointerId &&
        Math.hypot(
          event.clientX - doorGesture.start[0],
          event.clientY - doorGesture.start[1]
        ) >= 3
      )
        doorGesture.cancelled = true
      return
    }
    if (
      floorGesture?.pointerId === event.pointerId &&
      Math.hypot(
        event.clientX - floorGesture.start[0],
        event.clientY - floorGesture.start[1]
      ) >= 3
    )
      floorGesture.cancelled = true
    if (!gesture) {
      cursor()
      if (pick(event)?.kind === "door") element.style.cursor = "pointer"
      return
    }
    if (!gesture || gesture.pointerId !== event.pointerId) return
    if (
      !gesture.moved &&
      Math.hypot(
        event.clientX - gesture.start[0],
        event.clientY - gesture.start[1]
      ) < 3
    )
      return
    const point = pointAt(event)
    if (
      point &&
      onMove(gesture.id, [
        point[0] + gesture.offset[0],
        point[1] + gesture.offset[1],
      ])
    )
      gesture.moved = true
  }

  function up(event: PointerEvent) {
    if (tool === "pan") {
      cameraPointers.delete(event.pointerId)
      cursor()
      return
    }
    stop(event)
    touches.delete(event.pointerId)
    if (doorGesture?.pointerId === event.pointerId) {
      const previous = doorGesture
      const hit = pick(event)
      finishDoor()
      if (
        !previous.cancelled &&
        Math.hypot(
          event.clientX - previous.start[0],
          event.clientY - previous.start[1]
        ) < 3 &&
        hit?.kind === "door" &&
        hit.id === previous.id
      )
        onToggleDoor(previous.id)
      return
    }
    if (gesture?.pointerId === event.pointerId) finishFurniture()
    if (floorGesture?.pointerId === event.pointerId) {
      const previous = floorGesture
      floorGesture = null
      const point =
        !previous.cancelled &&
        Math.hypot(
          event.clientX - previous.start[0],
          event.clientY - previous.start[1]
        ) < 3
          ? pointAt(event)
          : null
      if (point) onPickFloor(point)
    }
  }

  function cancel(event: PointerEvent) {
    if (floorGesture?.pointerId === event.pointerId) floorGesture = null
    touches.delete(event.pointerId)
    if (doorGesture?.pointerId === event.pointerId) finishDoor()
    if (gesture?.pointerId === event.pointerId) finishFurniture()
    if (cameraPointers.has(event.pointerId)) finishCamera()
  }

  function wheel(event: WheelEvent) {
    if (tool === "pan" || !event.deltaY) return
    stop(event)
    // Same step as OrbitControls, including the stronger trackpad pinch.
    const lines = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1
    const amount =
      Math.abs(event.deltaY) * lines * (event.ctrlKey ? 10 : 1) * 0.01
    const scale = 0.95 ** amount
    zoomCamera(event.deltaY < 0 ? scale : 1 / scale)
  }

  function finish() {
    floorGesture = null
    touches.clear()
    finishDoor()
    finishFurniture()
    finishCamera()
  }

  function escape(event: KeyboardEvent) {
    if (event.key === "Escape") finish()
  }

  function setTool(next: CursorTool) {
    if (next === tool) return
    finish()
    tool = next
    setCameraEnabled(tool === "pan")
    cursor()
  }

  setCameraEnabled(tool === "pan")
  cursor()
  element.addEventListener("pointerdown", down, true)
  element.addEventListener("pointermove", move, true)
  element.addEventListener("pointerup", up, true)
  element.addEventListener("pointercancel", cancel, true)
  element.addEventListener("lostpointercapture", cancel)
  element.addEventListener("wheel", wheel, { capture: true, passive: false })
  window?.addEventListener("blur", finish)
  window?.addEventListener("keydown", escape)
  return {
    setTool,
    dispose() {
      element.removeEventListener("pointerdown", down, true)
      element.removeEventListener("pointermove", move, true)
      element.removeEventListener("pointerup", up, true)
      element.removeEventListener("pointercancel", cancel, true)
      element.removeEventListener("lostpointercapture", cancel)
      element.removeEventListener("wheel", wheel, true)
      window?.removeEventListener("blur", finish)
      window?.removeEventListener("keydown", escape)
      finish()
      element.style.cursor = ""
    },
  }
}
