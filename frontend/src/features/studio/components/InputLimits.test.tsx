// @vitest-environment happy-dom
import { act, useState } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, expect, it, vi } from "vite-plus/test"
import { AssistantPanel } from "./AssistantPanel"
import { NewProjectDialog } from "./NewProjectDialog"

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  vi.unstubAllGlobals()
})
async function mount(element: React.ReactNode) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  cleanups.push(() => {
    act(() => root.unmount())
    container.remove()
  })
  await act(async () => root.render(element))
  return container
}

it("shows a correctable length error and preserves the controlled chat value on Enter and submit", async () => {
  const onSend = vi.fn()
  const input = "가".repeat(1001)
  const container = await mount(<AssistantPanel messages={[]} input={input} roomName={null} busy={false} chatBusy={false} onInputChange={() => {}} onSend={onSend} />)
  const textarea = container.querySelector("textarea")!
  expect(textarea.maxLength).toBe(1000)
  expect(textarea.getAttribute("aria-invalid")).toBe("true")
  expect(container.textContent).toContain("1000")
  await act(async () => {
    textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }))
    container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
  })
  expect(onSend).not.toHaveBeenCalled()
  expect(textarea.value).toBe(input)
})

it("sends exactly 1000 UTF-16 units without truncation", async () => {
  const onSend = vi.fn()
  const input = "😀".repeat(500)
  const container = await mount(<AssistantPanel messages={[]} input={input} roomName={null} busy={false} chatBusy={false} onInputChange={() => {}} onSend={onSend} />)
  await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })))
  expect(onSend).toHaveBeenCalledExactlyOnceWith(input)
})

it("uses the 80-grapheme name policy and passes 80 family emoji unchanged", async () => {
  const onSubmit = vi.fn().mockResolvedValue(false)
  function Harness() {
    const [open, setOpen] = useState(true)
    return <NewProjectDialog open={open} onOpenChange={setOpen} busy={false} onSubmit={onSubmit} />
  }
  await mount(<Harness />)
  const input = document.querySelector<HTMLInputElement>('input[name="project-name"]')!
  expect(input.maxLength).toBe(1024)
  expect(document.querySelector('[role="dialog"]')!.textContent).toContain("80")
  const name = "👨‍👩‍👧‍👦".repeat(80)
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, name)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
  await act(async () => input.closest("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })))
  expect(onSubmit).toHaveBeenCalledExactlyOnceWith(name)
  expect(input.value).toBe(name)
})
