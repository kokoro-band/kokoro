// @vitest-environment happy-dom
import { act, StrictMode, useState } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { MeterField } from "./MeterField"

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  vi.unstubAllGlobals()
})

function setup() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  const commit = vi.fn()
  function Harness() {
    const [value, setValue] = useState(3)
    return (
      <>
        <MeterField
          label="가로"
          value={value}
          min={1}
          max={6}
          onCommit={(next) => {
            commit(next)
            setValue(next)
          }}
        />
        <output>{value}</output>
      </>
    )
  }
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  act(() =>
    root.render(
      <StrictMode>
        <Harness />
      </StrictMode>
    )
  )
  cleanups.push(() => {
    act(() => root.unmount())
    container.remove()
  })
  const input = container.querySelector("input")!
  const nativeValue = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )!.set!.bind(input)
  return {
    input,
    commit,
    output: () => container.querySelector("output")!.textContent,
    type(value: string) {
      act(() => {
        nativeValue(value)
        input.dispatchEvent(new Event("input", { bubbles: true }))
      })
    },
    key(key: string) {
      act(() => {
        input.dispatchEvent(
          new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
        )
      })
    },
    blur() {
      act(() => {
        input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }))
      })
    },
  }
}

describe("MeterField existing input behavior with real SEED components", () => {
  it("keeps intermediate text local and commits Enter only once before blur", () => {
    const field = setup()
    const label = document.getElementById(
      field.input.getAttribute("aria-labelledby") ?? ""
    )
    expect(label?.textContent).toContain("가로")
    field.type("4.")
    expect(field.input.value).toBe("4.")
    expect(field.output()).toBe("3")
    expect(field.commit).not.toHaveBeenCalled()
    field.key("Enter")
    field.blur()
    expect(field.output()).toBe("4")
    expect(field.input.value).toBe("4.0")
    expect(field.commit).toHaveBeenCalledExactlyOnceWith(4)
  })
  it("commits decimal comma input when leaving the field", () => {
    const field = setup()
    field.type("4,2")
    field.blur()
    expect(field.output()).toBe("4.2")
    expect(field.commit).toHaveBeenCalledExactlyOnceWith(4.2)
  })
  it("cancels Escape and does not commit on subsequent blur", () => {
    const field = setup()
    field.type("5")
    field.key("Escape")
    field.blur()
    expect(field.input.value).toBe("3.0")
    expect(field.output()).toBe("3")
    expect(field.commit).not.toHaveBeenCalled()
  })
  it.each(["", " ", "abc", "Infinity", "NaN"])(
    "restores invalid draft %j without changing saved value",
    (draft) => {
      const field = setup()
      field.type(draft)
      field.key("Enter")
      expect(field.input.value).toBe("3.0")
      expect(field.output()).toBe("3")
      expect(field.commit).not.toHaveBeenCalled()
    }
  )
  it.each([
    ["0", 1],
    ["10", 6],
    ["4.26", 4.3],
  ] as const)("clamps and rounds %s to %s", (draft, expected) => {
    const field = setup()
    field.type(draft)
    field.key("Enter")
    expect(field.output()).toBe(String(expected))
    expect(field.commit).toHaveBeenCalledExactlyOnceWith(expected)
  })
  it("steps with arrow keys and keeps unchanged commits out of the parent", () => {
    const field = setup()
    field.type("3.0")
    field.key("Enter")
    expect(field.commit).not.toHaveBeenCalled()
    field.key("ArrowUp")
    expect(field.output()).toBe("3.1")
    field.key("ArrowDown")
    expect(field.output()).toBe("3")
  })
})
