import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react"
import { normalizeDraft } from "../room-builder"
import type { StructureState } from "../structure-editing"
import type { Point2 } from "../types"

type Update = (
  start: StructureState,
  dx: number,
  dz: number
) => { state: StructureState; error?: string }
type Session = {
  pointerId: number
  surface: SVGSVGElement
  matrix: DOMMatrix
  start: Point2
  screenStart: Point2
  initial: StructureState
  next: StructureState
  update: Update
}

/** Preview is isolated from history. Cancel never changes either undo or redo. */
export function useStructureDrag(
  active: boolean,
  state: StructureState,
  commit: (state: StructureState) => void
) {
  const session = useRef<Session | null>(null)
  const [preview, setPreview] = useState<{
    state: StructureState
    viewBox: string
  } | null>(null)
  const [error, setError] = useState("")
  const cancel = useCallback(() => {
    const current = session.current
    session.current = null
    setPreview(null)
    setError("")
    if (current?.surface.hasPointerCapture(current.pointerId))
      current.surface.releasePointerCapture(current.pointerId)
  }, [])

  useEffect(
    function subscribeDragCancellation() {
      window.addEventListener("blur", cancel)
      return function cancelHiddenOrUnmountedDrag() {
        window.removeEventListener("blur", cancel)
        cancel()
      }
    },
    [active, cancel]
  )

  function begin(
    event: PointerEvent,
    surface: SVGSVGElement | null,
    update: Update
  ) {
    if (
      !active ||
      session.current ||
      !event.isPrimary ||
      event.button !== 0 ||
      !surface
    )
      return false
    const ctm = surface.getScreenCTM()
    if (!ctm) return false
    const matrix = ctm.inverse()
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      matrix
    )
    session.current = {
      pointerId: event.pointerId,
      surface,
      matrix,
      start: [point.x, point.y],
      screenStart: [event.clientX, event.clientY],
      initial: state,
      next: state,
      update,
    }
    surface.setPointerCapture(event.pointerId)
    setPreview({ state, viewBox: surface.getAttribute("viewBox")! })
    setError("")
    event.preventDefault()
    event.stopPropagation()
    return true
  }

  function move(event: PointerEvent) {
    const current = session.current
    if (!current || current.pointerId !== event.pointerId) return
    if (
      Math.hypot(
        event.clientX - current.screenStart[0],
        event.clientY - current.screenStart[1]
      ) < 3
    ) {
      current.next = current.initial
      setPreview(
        (previous) => previous && { ...previous, state: current.initial }
      )
      setError("")
      return
    }
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      current.matrix
    )
    const result = current.update(
      current.initial,
      point.x - current.start[0],
      point.y - current.start[1]
    )
    // Keep the last valid preview on a rejected movement, never remove openings.
    if (!result.error) {
      current.next = result.state
      setPreview((previous) => previous && { ...previous, state: result.state })
    }
    setError(result.error ?? "")
  }

  function end(event: PointerEvent) {
    const current = session.current
    if (!current || current.pointerId !== event.pointerId) return
    move(event)
    if (JSON.stringify(current.next) !== JSON.stringify(current.initial)) {
      commit({ ...current.next, draft: normalizeDraft(current.next.draft) })
    }
    cancel()
  }

  function cancelPointer(event: PointerEvent) {
    if (session.current?.pointerId === event.pointerId) cancel()
  }

  return {
    preview,
    error,
    dragging: Boolean(preview),
    begin,
    move,
    end,
    cancel,
    cancelPointer,
    setError,
  }
}
