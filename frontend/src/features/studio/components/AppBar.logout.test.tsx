// @vitest-environment happy-dom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, expect, it, vi } from "vite-plus/test"
import { AppBar } from "./AppBar"

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  vi.unstubAllGlobals()
})

function mount(onLogout?: () => void) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  cleanups.push(() => {
    act(() => root.unmount())
    container.remove()
  })
  const noop = () => {}
  act(() =>
    root.render(
      <AppBar
        projectName="우리 집"
        view="arrange"
        structureDirty={false}
        showViews
        dirty={false}
        saving={false}
        saveFailed={false}
        saveRejected={false}
        saveBusy={false}
        onViewChange={noop}
        onSave={noop}
        onRestoreSaved={noop}
        onCreateProject={noop}
        onOpenSample={noop}
        onOpenFloorPlan={noop}
        onExport={noop}
        onOpenShortcuts={noop}
        onLogout={onLogout}
      />
    )
  )
}
async function openMenu() {
  const trigger = document.querySelector<HTMLElement>(
    '[aria-label="우리 집 프로젝트 메뉴"]'
  )!
  await act(async () => {
    trigger.click()
    await Promise.resolve()
  })
}
const items = () =>
  [...document.querySelectorAll('[role="menuitem"]')].map((node) =>
    node.textContent?.trim()
  )

it("shows no logout item when the studio is not behind a login", async () => {
  mount()
  await openMenu()

  expect(items()).toContain("새 프로젝트")
  expect(items()).not.toContain("로그아웃")
})

it("calls onLogout from the logout item", async () => {
  const onLogout = vi.fn()
  mount(onLogout)
  await openMenu()

  const item = [
    ...document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
  ].find((node) => node.textContent?.trim() === "로그아웃")
  act(() => item!.click())

  expect(onLogout).toHaveBeenCalledOnce()
})
