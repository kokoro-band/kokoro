// @vitest-environment happy-dom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"

import { useShortcut } from "./useShortcut"

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
const roots: ReturnType<typeof createRoot>[] = []
afterEach(() => {
  roots.splice(0).forEach((root) => act(() => root.unmount()))
  document.body.replaceChildren()
})

function setup(enabled = true) {
  const tool = vi.fn()
  const view = vi.fn()
  function Harness() {
    useShortcut("cursorSelect", tool, { enabled })
    useShortcut("viewStructure", view)
    return (
      <>
        <input aria-label="가로" />
        <textarea />
        <div contentEditable />
        <button>도구</button>
      </>
    )
  }
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(<Harness />))
  const key = (element: HTMLElement, options: KeyboardEventInit = {}) => {
    element.focus()
    act(() => {
      element.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "1",
          code: "Digit1",
          ...options,
        })
      )
      element.dispatchEvent(
        new KeyboardEvent("keyup", {
          bubbles: true,
          key: "1",
          code: "Digit1",
          ...options,
        })
      )
    })
  }
  return { tool, view, key, container }
}

describe("cursor keyboard shortcuts", () => {
  it("keeps digit tools separate from Alt+digit navigation even on macOS", () => {
    const s = setup()
    const button = s.container.querySelector("button")!
    s.key(button)
    expect(s.tool).toHaveBeenCalledTimes(1)
    expect(s.view).not.toHaveBeenCalled()
    s.key(button, { altKey: true, key: "¡" })
    expect(s.tool).toHaveBeenCalledTimes(1)
    expect(s.view).toHaveBeenCalledTimes(1)
  })

  it("does not switch tools or screens in editable fields", () => {
    const s = setup()
    for (const target of s.container.querySelectorAll<HTMLElement>(
      "input, textarea, [contenteditable]"
    )) {
      s.key(target)
      s.key(target, { altKey: true })
    }
    expect(s.tool).not.toHaveBeenCalled()
    expect(s.view).not.toHaveBeenCalled()
  })

  it("ignores IME composition, modal dialogs and repeated keydown", () => {
    const s = setup()
    const button = s.container.querySelector("button")!
    s.key(button, { isComposing: true })
    s.key(button, { repeat: true })
    const modal = document.createElement("div")
    modal.setAttribute("aria-modal", "true")
    document.body.append(modal)
    s.key(button)
    expect(s.tool).not.toHaveBeenCalled()
  })

  it("can disable desktop tools while showing VR", () => {
    const s = setup(false)
    s.key(s.container.querySelector("button")!)
    expect(s.tool).not.toHaveBeenCalled()
  })
})
