// @vitest-environment happy-dom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { QueryClientProvider } from "@tanstack/react-query"
import { afterAll, afterEach, describe, expect, it, vi } from "vite-plus/test"
import type { AxiosRequestConfig } from "axios"
import App from "./App"
import { AuthGate } from "./features/studio/components/AuthGate"
import { sampleProject } from "./features/studio/data"
import type { Project } from "./features/studio/types"
import { currentSession, logout } from "./lib/auth"
import { saveSession } from "./lib/auth-session"
import { queryClient } from "./lib/query-client"

const http = vi.hoisted(() => {
  vi.stubEnv("VITE_API_MODE", "server")
  vi.stubEnv("VITE_AUTH_MODE", "demo")
  type Call = {
    config: AxiosRequestConfig
    resolve: (value: unknown) => void
    reject: (error: Error) => void
  }
  const calls: Call[] = []
  return {
    calls,
    request: (config: AxiosRequestConfig) =>
      new Promise((resolve, reject) => {
        calls.push({ config, resolve, reject })
      }),
  }
})
vi.mock("./lib/http-client", async (original) => ({
  ...(await original<object>()),
  request: http.request,
}))
vi.mock("./lib/use-media-query", () => ({ useMediaQuery: () => false }))
vi.mock("./features/studio/components/SceneEditor", () => ({
  SceneEditor: () => <div>WebGL 경계</div>,
}))

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  http.calls.length = 0
  logout()
  queryClient.clear()
  localStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
afterAll(() => vi.unstubAllEnvs())

function project(id: string, name: string): Project {
  return { ...structuredClone(sampleProject), id, name, revision: 0 }
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 40; i++) await Promise.resolve()
  })
}

function signIn(username: string) {
  act(() =>
    saveSession({
      token: `token-${username}`,
      username,
      expiresAt: Date.now() + 3_600_000,
    })
  )
}

async function mount(username: string) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  signIn(username)
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  cleanups.push(() => {
    act(() => root.unmount())
    container.remove()
  })
  act(() =>
    root.render(
      <QueryClientProvider client={queryClient}>
        <AuthGate>
          <App />
        </AuthGate>
      </QueryClientProvider>
    )
  )
  await flush()
}

function lastCall() {
  return http.calls.at(-1)!
}

async function answer(value: unknown) {
  await act(async () => lastCall().resolve(value))
  await flush()
}

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

const requestedUrls = () => http.calls.map((call) => call.config.url)

describe("demo project entry", () => {
  it("shows a first-project entry instead of the shared sample for an account with no projects", async () => {
    await mount("fresh-01")

    expect(requestedUrls()).toEqual(["/projects"])
    await answer([])

    expect(requestedUrls()).not.toContain(`/projects/${sampleProject.id}`)
    expect(document.body.textContent).toContain("첫 프로젝트를 만들어 주세요")
    expect(document.body.textContent).not.toContain(
      "프로젝트를 불러오지 못했어요"
    )
    await click("로그아웃")
    expect(currentSession()).toBeNull()
  })

  it("opens the account's most recent project when nothing is remembered", async () => {
    await mount("maker-01")

    await answer([
      project("recent-a", "최근 집"),
      project("older-b", "예전 집"),
    ])

    expect(requestedUrls()).toEqual(["/projects", "/projects/recent-a"])
    await answer(project("recent-a", "최근 집"))
    await click("최근 집 프로젝트 메뉴")
    expect(document.body.textContent).toContain("새 프로젝트")
    expect(document.body.textContent).not.toContain("예제 집 열기")
  })

  it("reopens the same account's project after signing out and back in", async () => {
    await mount("maker-01")
    await answer([project("project-a", "민지네 집")])
    await answer(project("project-a", "민지네 집"))
    await click("민지네 집 프로젝트 메뉴")
    await click("로그아웃")
    http.calls.length = 0

    signIn("maker-01")
    await flush()

    expect(requestedUrls()).toEqual(["/projects/project-a"])
  })

  it("never opens the previous account's project after switching accounts", async () => {
    await mount("maker-01")
    await answer([project("project-a", "민지네 집")])
    await answer(project("project-a", "민지네 집"))
    await click("민지네 집 프로젝트 메뉴")
    await click("로그아웃")
    http.calls.length = 0

    signIn("maker-02")
    await flush()

    expect(requestedUrls()).toEqual(["/projects"])
  })
})
