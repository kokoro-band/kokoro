// @vitest-environment happy-dom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterAll, afterEach, describe, expect, it, vi } from "vite-plus/test"
import App from "./App"
import { AuthGate } from "./features/studio/components/AuthGate"
import { sampleProject } from "./features/studio/data"
import { currentSession, logout } from "./lib/auth"
import { saveSession } from "./lib/auth-session"

vi.hoisted(() => {
  vi.stubEnv("VITE_API_MODE", "local")
  vi.stubEnv("VITE_AUTH_MODE", "demo")
})
vi.mock("./lib/use-media-query", () => ({ useMediaQuery: () => false }))
vi.mock("./features/studio/components/SceneEditor", () => ({
  SceneEditor: () => <div>WebGL 경계</div>,
}))
const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  logout()
  localStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
afterAll(() => vi.unstubAllEnvs())

const activeKey = "kokoro-active-server-project-v1"

async function flush() {
  await act(async () => {
    for (let i = 0; i < 40; i++) await Promise.resolve()
  })
}
async function setup() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  localStorage.setItem(
    "kokoro-remodel-project-v1",
    JSON.stringify(structuredClone(sampleProject))
  )
  localStorage.setItem(activeKey, "previous-users-project")
  saveSession({
    token: "t-1",
    username: "maker-01",
    expiresAt: Date.now() + 3_600_000,
  })
  const client = new QueryClient()
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  cleanups.push(() => {
    act(() => root.unmount())
    client.clear()
    container.remove()
  })
  act(() =>
    root.render(
      <QueryClientProvider client={client}>
        <AuthGate>
          <App />
        </AuthGate>
      </QueryClientProvider>
    )
  )
  await flush()
  async function click(name: string) {
    const target = [
      ...document.querySelectorAll<HTMLElement>("button, [role=menuitem]"),
    ].find(
      (node) =>
        !node.closest("[hidden]") &&
        (node.getAttribute("aria-label") ?? node.textContent)?.trim() === name
    )
    expect(target, name).toBeDefined()
    act(() => target!.click())
    await flush()
  }
  return { click, container }
}

describe("signing out", () => {
  it("offers a logout item in the project menu and returns to the login form", async () => {
    const ui = await setup()
    await ui.click(`${sampleProject.name} 프로젝트 메뉴`)

    await ui.click("로그아웃")

    expect(document.querySelector('input[name="username"]')).not.toBeNull()
    expect(document.querySelector('input[name="password"]')).not.toBeNull()
    expect(currentSession()).toBeNull()
  })

  it("forgets the previous person's open project so the next person starts clean", async () => {
    const ui = await setup()
    await ui.click(`${sampleProject.name} 프로젝트 메뉴`)

    await ui.click("로그아웃")

    expect(localStorage.getItem(activeKey)).toBeNull()
  })
})
