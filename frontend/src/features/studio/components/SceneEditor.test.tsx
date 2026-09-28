// @vitest-environment happy-dom
import { act, useState } from "react"
import { createRoot } from "react-dom/client"
import { SnackbarProvider } from "seed-design/ui/snackbar"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { SceneEditor } from "./SceneEditor"
import { NewProjectDialog } from "./NewProjectDialog"
import { useShortcut } from "../hooks/useShortcut"
import { sampleProject } from "../data"
import type { ViewMode } from "../types"
import type { CursorTool } from "../scene-interaction"

// Keep actual SceneEditor, SEED menu/dialog and hotkeys. Replace only WebGL.
vi.mock("../RoomScene", () => ({
  RoomScene: ({
    tool,
    doorStates,
    highlightedDoorId,
  }: {
    tool: CursorTool
    doorStates: Record<string, boolean>
    highlightedDoorId: string | null
  }) => (
    <output
      aria-label="장면 입력"
      data-tool={tool}
      data-doors={JSON.stringify(doorStates)}
      data-highlight={highlightedDoorId ?? ""}
    />
  ),
}))
const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
async function flush() {
  await act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve()
  })
}
async function key(
  target: HTMLElement,
  key: string,
  code: string,
  extra: KeyboardEventInit = {}
) {
  act(() => {
    for (const type of ["keydown", "keyup"])
      target.dispatchEvent(
        new KeyboardEvent(type, {
          bubbles: true,
          cancelable: true,
          key,
          code,
          ...extra,
        })
      )
  })
  await flush()
}
async function setup() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  const project = structuredClone(sampleProject)
  const doors = project
    .room!.openings.filter((opening) => opening.type === "door")
    .slice(0, 2)
  project.room!.openings = doors
  const undo = vi.fn()
  const redo = vi.fn()
  function Harness() {
    const [mode, setMode] = useState<ViewMode>("3d")
    const [dialog, setDialog] = useState(false)
    const [view, setView] = useState("arrange")
    useShortcut("viewStructure", () => setView("structure"))
    useShortcut("viewArrange", () => setView("arrange"))
    return (
      <SnackbarProvider>
        <button onClick={() => setDialog(true)}>새 프로젝트 열기</button>
        <input aria-label="치수" />
        <textarea aria-label="배치 요청" />
        <div contentEditable aria-label="편집 영역" />
        <output aria-label="화면">{view}</output>
        <SceneEditor
          project={project}
          focusRoom={null}
          selectedId={null}
          mode={mode}
          canUndo
          canRedo
          onModeChange={setMode}
          onUndo={undo}
          onRedo={redo}
          onFullscreenError={() => {}}
          onSelect={() => {}}
          onMove={() => true}
          onMoveEnd={() => {}}
        />
        <NewProjectDialog
          open={dialog}
          onOpenChange={setDialog}
          busy={false}
          onSubmit={async () => true}
        />
      </SnackbarProvider>
    )
  }
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  cleanups.push(() => {
    act(() => root.unmount())
    container.remove()
  })
  act(() => root.render(<Harness />))
  await act(async () => vi.dynamicImportSettled())
  await flush()
  const scene = () =>
    container.querySelector<HTMLOutputElement>('[aria-label="장면 입력"]')!
  const button = (name: string) =>
    [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (node) =>
        (node.getAttribute("aria-label") ?? node.textContent)?.trim() === name
    )!
  async function click(name: string) {
    act(() => button(name).click())
    await flush()
  }
  const states = (): Record<string, boolean> =>
    JSON.parse(scene().dataset.doors!)
  const tool = () => scene().dataset.tool
  const menu = () =>
    document.querySelector<HTMLElement>('[role="menu"]')
  const items = () => [
    ...(menu()?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []),
  ]
  return {
    container,
    scene,
    button,
    click,
    states,
    tool,
    menu,
    items,
    doors,
    undo,
    redo,
  }
}

describe("scene tools wired to actual keyboard controls", () => {
  it("selects each digit tool in both 2D and 3D and passes it to the scene", async () => {
    const app = await setup()
    for (const mode of ["2D", "3D"]) {
      await app.click(mode)
      app.button(mode).focus()
      for (const [digit, tool] of [
        ["1", "select"],
        ["3", "pan"],
        ["2", "move"],
      ]) {
        await key(app.button(mode), digit, `Digit${digit}`)
        expect(app.tool()).toBe(tool)
        expect(
          app.container
            .querySelector(`[aria-label="커서 도구"] [data-value="${tool}"]`)
            ?.getAttribute("aria-checked")
        ).toBe("true")
      }
    }
  })
  it("keeps toolbar clicks and arrow navigation in sync with the scene", async () => {
    const app = await setup()
    await app.click("선택")
    expect(app.tool()).toBe("select")
    app.button("선택").focus()
    await key(app.button("선택"), "ArrowRight", "ArrowRight")
    expect(app.tool()).toBe("move")
    expect(document.activeElement === app.button("가구 이동")).toBe(true)
    await app.click("화면 이동")
    expect(app.tool()).toBe("pan")
  })
  it("protects editable fields, composition and key repeat", async () => {
    const app = await setup()
    for (const input of app.container.querySelectorAll<HTMLElement>(
      "input,textarea,[contenteditable]"
    )) {
      input.focus()
      await key(input, "1", "Digit1")
      await key(input, "3", "Digit3")
      await key(input, "1", "Digit1", { altKey: true })
    }
    const trigger = app.button("3D")
    trigger.focus()
    await key(trigger, "1", "Digit1", { isComposing: true })
    await key(trigger, "3", "Digit3", { repeat: true })
    expect(app.tool()).toBe("move")
    expect(
      app.container.querySelector('[aria-label="화면"]')?.textContent
    ).toBe("arrange")
  })
  it("routes Alt+digit to the screen hook rather than the tool", async () => {
    const app = await setup()
    const trigger = app.button("3D")
    trigger.focus()
    await key(trigger, "¡", "Digit1", { altKey: true })
    expect(
      app.container.querySelector('[aria-label="화면"]')?.textContent
    ).toBe("structure")
    expect(app.tool()).toBe("move")
  })
  it("does not change desktop tools in VR and restores the prior tool on return", async () => {
    const app = await setup()
    await app.click("선택")
    await app.click("VR")
    app.button("VR").focus()
    for (const digit of ["2", "3"])
      await key(app.button("VR"), digit, `Digit${digit}`)
    expect(app.container.querySelector('[aria-label="커서 도구"]')).toBeNull()
    expect(app.tool()).toBe("select")
    await app.click("3D")
    expect(app.tool()).toBe("select")
  })
  it("blocks background tool keys while a real SEED dialog is open, then restores them", async () => {
    const app = await setup()
    await app.click("새 프로젝트 열기")
    expect(document.querySelector('[aria-modal="true"]')).not.toBeNull()
    await key(document.body, "1", "Digit1")
    expect(app.tool()).toBe("move")
    const cancel = [
      ...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button'),
    ].find((item) => item.textContent?.trim() === "취소")!
    act(() => cancel.click())
    await flush()
    app.button("3D").focus()
    await key(app.button("3D"), "1", "Digit1")
    expect(app.tool()).toBe("select")
  })
  it("opens the real door menu with the keyboard and returns focus on Escape", async () => {
    const app = await setup()
    const trigger = app.button("문 열고 닫기")
    trigger.focus()
    await key(trigger, "ArrowDown", "ArrowDown")
    expect(trigger.getAttribute("aria-expanded")).toBe("true")
    await vi.waitFor(() =>
      expect(app.menu()?.contains(document.activeElement)).toBe(true)
    )
    await key(document.activeElement as HTMLElement, "3", "Digit3")
    expect(app.tool()).toBe("move")
    await key(document.activeElement as HTMLElement, "Escape", "Escape")
    await vi.waitFor(() =>
      expect(document.activeElement === trigger).toBe(true)
    )
    expect(trigger.getAttribute("aria-expanded")).toBe("false")
    await key(trigger, "1", "Digit1")
    expect(app.tool()).toBe("select")
  })
  it("blocks background digits when a door menu is open but focus is still on the trigger", async () => {
    const app = await setup()
    await app.click("문 열고 닫기")
    expect(app.button("문 열고 닫기").getAttribute("aria-expanded")).toBe(
      "true"
    )
    await key(app.button("문 열고 닫기"), "3", "Digit3")
    expect(app.tool()).toBe("move")
  })
  it("reaches bulk door actions with arrow navigation, not direct focus injection", async () => {
    const app = await setup()
    const trigger = app.button("문 열고 닫기")
    trigger.focus()
    await key(trigger, "ArrowDown", "ArrowDown")
    await vi.waitFor(() =>
      expect(app.menu()?.contains(document.activeElement)).toBe(true)
    )
    const reached = new Set<string>()
    for (let i = 0; i < app.doors.length + 4; i++) {
      reached.add(
        document.activeElement?.getAttribute("aria-label") ??
          document.activeElement?.textContent ??
          ""
      )
      await key(document.activeElement as HTMLElement, "ArrowDown", "ArrowDown")
    }
    expect([...reached].some((name) => name.includes("모두 열기"))).toBe(true)
  })
  it("toggles individual doors with Enter and Space without changing layout or closing the menu", async () => {
    const app = await setup()
    const trigger = app.button("문 열고 닫기")
    trigger.focus()
    await key(trigger, "ArrowDown", "ArrowDown")
    await vi.waitFor(() =>
      expect(app.menu()?.contains(document.activeElement)).toBe(true)
    )
    for (let i = 0; i < app.items().length + 2; i++) {
      if (
        document.activeElement?.textContent?.includes("열기") &&
        !document.activeElement?.textContent?.includes("모두")
      )
        break
      await key(document.activeElement as HTMLElement, "ArrowDown", "ArrowDown")
    }
    expect(app.scene().dataset.highlight).toBe(app.doors[0].id)
    await key(document.activeElement as HTMLElement, "Enter", "Enter")
    expect(app.states()[app.doors[0].id]).toBe(true)
    expect(trigger.getAttribute("aria-expanded")).toBe("true")
    await key(document.activeElement as HTMLElement, " ", "Space")
    expect(app.states()[app.doors[0].id]).toBe(false)
    expect(app.undo).not.toHaveBeenCalled()
  })
})
