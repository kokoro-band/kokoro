// @vitest-environment happy-dom
import { act, type PointerEvent } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { useEditorHistory } from "./useEditorHistory"
import { useStructureDrag } from "./useStructureDrag"
import { resizeStructure, type StructureState } from "../structure-editing"

const initial: StructureState = {
  draft: {
    rooms: [{ id: "a", name: "방", x: 0, z: 0, width: 4, depth: 4 }],
    wallHeight: 2.4,
  },
  openings: [],
}
const update = (state: StructureState, dx: number, dz: number) =>
  resizeStructure(state, "a", "se", dx, dz)
const event = (x = 0, pointerId = 1) =>
  ({
    clientX: x * 10,
    clientY: 0,
    pointerId,
    isPrimary: true,
    button: 0,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  }) as unknown as PointerEvent

function setup() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.stubGlobal(
    "DOMPoint",
    class {
      x: number
      y: number
      constructor(x: number, y: number) {
        this.x = x / 10
        this.y = y / 10
      }
      matrixTransform() {
        return this
      }
    }
  )
  const surface = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  surface.setAttribute("viewBox", "0 0 5 5")
  Object.assign(surface, {
    getScreenCTM: () => ({ inverse: () => ({}) }),
    setPointerCapture: vi.fn(),
    hasPointerCapture: () => false,
  })
  const result: {
    current?: {
      drag: ReturnType<typeof useStructureDrag>
      history: ReturnType<typeof useEditorHistory<StructureState>>
    }
  } = {}
  function Harness({ active }: { active: boolean }) {
    const history = useEditorHistory(() => initial)
    const drag = useStructureDrag(active, history.present, (next) =>
      history.set(() => next)
    )
    Object.assign(result, { current: { drag, history } })
    return null
  }
  const root = createRoot(document.createElement("div"))
  act(() => root.render(<Harness active />))
  return {
    surface,
    get: () => result.current!,
    unmount: () => act(() => root.unmount()),
    hide: () => act(() => root.render(<Harness active={false} />)),
  }
}

afterEach(() => vi.unstubAllGlobals())

describe("structure drag transaction", () => {
  it("previews separately and commits all pointer moves as one undo entry", () => {
    const app = setup()
    act(() => {
      app.get().drag.begin(event(), app.surface, update)
    })
    act(() => app.get().drag.move(event(1)))
    act(() => app.get().drag.move(event(2)))
    expect(app.get().history.present).toBe(initial)
    expect(app.get().drag.preview?.state.draft.rooms[0].width).toBe(6)
    expect(app.get().drag.preview?.viewBox).toBe("0 0 5 5")
    act(() => app.get().drag.end(event(2)))
    expect(app.get().history.present.draft.rooms[0].width).toBe(6)
    act(() => app.get().history.undo())
    expect(app.get().history.present).toBe(initial)
    expect(app.get().history.canUndo).toBe(false)
    act(() => app.get().history.redo())
    expect(app.get().history.present.draft.rooms[0].width).toBe(6)
    app.unmount()
  })

  it.each(["cancel", "pointercancel", "hide", "blur", "no-op"])(
    "%s preserves history and redo",
    (action) => {
      const app = setup()
      act(() => app.get().history.set(() => update(initial, 1, 0).state))
      act(() => app.get().history.undo())
      act(() => {
        app.get().drag.begin(event(), app.surface, update)
      })
      if (action !== "no-op") act(() => app.get().drag.move(event(2)))
      act(() => {
        if (action === "cancel") app.get().drag.cancel()
        if (action === "pointercancel") app.get().drag.cancelPointer(event())
        if (action === "blur") window.dispatchEvent(new Event("blur"))
        if (action === "no-op") app.get().drag.end(event())
      })
      if (action === "hide") app.hide()
      expect(app.get().history.present).toBe(initial)
      expect(app.get().history.canUndo).toBe(false)
      expect(app.get().history.canRedo).toBe(true)
      expect(app.get().drag.dragging).toBe(false)
      app.unmount()
    }
  )

  it("ignores second-pointer movement, release and cancellation", () => {
    const app = setup()
    act(() => {
      app.get().drag.begin(event(), app.surface, update)
    })
    act(() => {
      expect(app.get().drag.begin(event(10, 2), app.surface, update)).toBe(
        false
      )
      app.get().drag.move(event(10, 2))
      app.get().drag.end(event(10, 2))
      app.get().drag.cancelPointer(event(10, 2))
    })
    expect(app.get().drag.dragging).toBe(true)
    expect(app.get().drag.preview?.state).toBe(initial)
    act(() => app.get().drag.end(event(1)))
    expect(app.get().history.present.draft.rooms[0].width).toBe(5)
    app.unmount()
  })
})
