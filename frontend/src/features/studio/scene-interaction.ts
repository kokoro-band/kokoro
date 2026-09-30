export type CursorTool = "select" | "move" | "pan"
type Point = [x: number, z: number]
type Hit = { id: string; center: Point }

/** Owns pointer gestures before OrbitControls can handle their bubbling events. */
export function bindSceneInteraction({
  element,
  initialTool,
  pick,
  pointAt,
  onSelect,
  onMove,
  onCommit,
  setCameraEnabled,
  resetCameraGesture,
}: {
  element: HTMLElement
  initialTool: CursorTool
  pick: (event: PointerEvent) => Hit | null
  pointAt: (event: PointerEvent) => Point | null
  onSelect: (id: string | null) => void
  onMove: (id: string, point: Point) => boolean
  onCommit: () => void
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
  const cameraPointers = new Set<number>()
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
    if (gesture || event.button !== 0 || !event.isPrimary) return
    const hit = pick(event)
    onSelect(hit?.id ?? null)
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
    if (gesture?.pointerId === event.pointerId) finishFurniture()
  }

  function cancel(event: PointerEvent) {
    if (gesture?.pointerId === event.pointerId) finishFurniture()
    if (cameraPointers.has(event.pointerId)) finishCamera()
  }

  function finish() {
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
      window?.removeEventListener("blur", finish)
      window?.removeEventListener("keydown", escape)
      finish()
      element.style.cursor = ""
    },
  }
}
