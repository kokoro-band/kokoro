// @vitest-environment happy-dom
import {
  act,
  createRef,
  StrictMode,
  useImperativeHandle,
  type Ref,
} from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { useEditorHistory } from "./useEditorHistory"

type History = ReturnType<typeof useEditorHistory<number>>
const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
function setup() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  const ref = createRef<History>()
  function Harness({ handle }: { handle: Ref<History> }) {
    const history = useEditorHistory(() => 0)
    useImperativeHandle(handle, () => history)
    return null
  }
  const root = createRoot(document.createElement("div"))
  act(() =>
    root.render(
      <StrictMode>
        <Harness handle={ref} />
      </StrictMode>
    )
  )
  cleanups.push(() => act(() => root.unmount()))
  return () => ref.current!
}

describe("editor undo and redo", () => {
  it("groups real tagged edits in one React batch", () => {
    const history = setup()
    act(() => {
      history().set(() => 1, "width")
      history().set(() => 2, "width")
    })
    act(() => history().undo())
    expect(history().present).toBe(0)
    expect(history().canUndo).toBe(false)
    act(() => history().redo())
    expect(history().present).toBe(2)
  })
  it("preserves redo through a tagged no-op after undo", () => {
    const history = setup()
    act(() => history().set(() => 1, "width"))
    act(() => history().undo())
    act(() => history().set((value) => value, "width"))
    expect(history().canRedo).toBe(true)
    act(() => history().set(() => 2, "width"))
    expect(history().canRedo).toBe(false)
    act(() => history().undo())
    expect(history().present).toBe(0)
  })
  it("does not let a tagged no-op consume the first undo boundary", () => {
    const history = setup()
    act(() => {
      history().set((value) => value, "width")
      history().set(() => 1, "width")
    })
    act(() => history().undo())
    expect(history().present).toBe(0)
    act(() => history().redo())
    expect(history().present).toBe(1)
  })
  it("does not extend the merge window for a no-op", () => {
    const history = setup()
    const now = vi.spyOn(Date, "now").mockReturnValue(1000)
    act(() => history().set(() => 1, "width"))
    now.mockReturnValue(1600)
    act(() => history().set((value) => value, "width"))
    now.mockReturnValue(1800)
    act(() => history().set(() => 2, "width"))
    act(() => history().undo())
    expect(history().present).toBe(1)
  })
  it("keeps a marked boundary through no-op replacement in a batch", () => {
    const history = setup()
    act(() => {
      history().mark()
      history().replace((value) => value)
      history().replace(() => 1)
      history().replace(() => 2)
    })
    act(() => history().undo())
    expect(history().present).toBe(0)
    act(() => history().redo())
    expect(history().present).toBe(2)
  })
  it("keeps empty undo and redo harmless and restores an edit", () => {
    const history = setup()
    act(() => {
      history().undo()
      history().redo()
    })
    expect(history().present).toBe(0)
    act(() => history().set(() => 1))
    act(() => history().undo())
    expect(history().present).toBe(0)
    expect(history().canRedo).toBe(true)
    act(() => history().redo())
    expect(history().present).toBe(1)
    expect(history().canRedo).toBe(false)
  })
  it("preserves redo for no-op edits but clears it for new edits", () => {
    const history = setup()
    act(() => history().set(() => 1))
    act(() => history().undo())
    act(() => history().set((value) => value))
    expect(history().canRedo).toBe(true)
    act(() => history().set(() => 2))
    expect(history().canRedo).toBe(false)
  })
  it("groups repeated tagged edits within 700ms and splits later edits", () => {
    const history = setup()
    const now = vi.spyOn(Date, "now").mockReturnValue(1000)
    act(() => history().set(() => 1, "width"))
    now.mockReturnValue(1699)
    act(() => history().set(() => 2, "width"))
    now.mockReturnValue(2399)
    act(() => history().set(() => 3, "width"))
    act(() => history().undo())
    expect(history().present).toBe(2)
    act(() => history().undo())
    expect(history().present).toBe(0)
    expect(history().canUndo).toBe(false)
  })
  it("separates different fields and makes reset undoable", () => {
    const history = setup()
    act(() => history().set(() => 1, "width"))
    act(() => history().set(() => 2, "depth"))
    act(() => history().reset(10))
    act(() => history().undo())
    expect(history().present).toBe(2)
    act(() => history().undo())
    expect(history().present).toBe(1)
  })
  it("bounds undo history to the most recent 50 edits", () => {
    const history = setup()
    for (let i = 1; i <= 55; i++) act(() => history().set(() => i))
    for (let i = 0; i < 50; i++) act(() => history().undo())
    expect(history().present).toBe(5)
    expect(history().canUndo).toBe(false)
    act(() => history().undo())
    expect(history().present).toBe(5)
  })
})
