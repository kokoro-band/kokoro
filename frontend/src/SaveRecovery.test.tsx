// @vitest-environment happy-dom
import { act, StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterAll, afterEach, describe, expect, it, vi } from "vite-plus/test"
import type { AxiosRequestConfig } from "axios"
import App from "./App"
import { ApiError } from "./lib/http-client"
import { sampleProject } from "./features/studio/data"
import { buildRoomModel } from "./features/studio/room-builder"
import type { Project } from "./features/studio/types"

const http = vi.hoisted(() => {
  vi.stubEnv("VITE_API_MODE", "server")
  type Call = {
    config: AxiosRequestConfig
    resolve: (value: Project) => void
    reject: (error: Error) => void
  }
  const calls: Call[] = []
  return {
    calls,
    request: (config: AxiosRequestConfig) =>
      new Promise<Project>((resolve, reject) => {
        calls.push({ config, resolve, reject })
      }),
  }
})
vi.mock("./lib/http-client", async (original) => ({
  ...(await original<object>()),
  request: http.request,
}))
vi.mock("./features/studio/components/SceneEditor", () => ({
  SceneEditor: () => <div>WebGL 경계</div>,
}))

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
  http.calls.length = 0
  localStorage.clear()
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
afterAll(() => vi.unstubAllEnvs())

async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
}

async function setup() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
  vi.stubGlobal(
    "confirm",
    vi.fn(() => true)
  )
  const initial: Project = {
    ...structuredClone(sampleProject),
    id: "project-a",
    name: "검증 A",
    furniture: [],
    dimensions: { width: 8, depth: 8, height: 2.4 },
    room: buildRoomModel({
      rooms: [{ id: "living", name: "거실", x: 0, z: 0, width: 8, depth: 8 }],
      wallHeight: 2.4,
    }),
  }
  localStorage.setItem("kokoro-active-server-project-v1", initial.id)
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  cleanups.push(async () => {
    await act(async () => root.unmount())
    client.clear()
    container.remove()
  })
  await act(async () =>
    root.render(
      <StrictMode>
        <QueryClientProvider client={client}>
          <App />
        </QueryClientProvider>
      </StrictMode>
    )
  )
  await settle()
  expect(http.calls[0].config.url).toBe("/projects/project-a")
  await act(async () => http.calls[0].resolve(initial))
  await settle()
  function button(name: string, scope: ParentNode = document) {
    const buttons = [
      ...scope.querySelectorAll<HTMLButtonElement>('button,[role="menuitem"]'),
    ]
    const result = buttons.find(
      (node) =>
        !node.closest("[hidden]") &&
        (node.getAttribute("aria-label") ?? node.textContent ?? "").replaceAll(
          /\s/g,
          ""
        ) === name.replaceAll(/\s/g, "")
    )
    expect(result, `button ${name}`).toBeDefined()
    return result!
  }
  async function click(name: string, scope?: ParentNode) {
    await act(async () => button(name, scope).click())
    await settle()
  }
  async function type(name: string, value: string) {
    const input = [
      ...document.querySelectorAll<HTMLInputElement>("input"),
    ].find(
      (node) =>
        !node.closest("[hidden]") &&
        (node.getAttribute("aria-label") === name ||
          document.getElementById(node.getAttribute("aria-labelledby") ?? "")
            ?.textContent === name)
    )!
    expect(input, name).toBeDefined()
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!.call(input, value)
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })
    return input
  }
  const saves = () =>
    http.calls.filter((call) => call.config.url?.endsWith("/layout"))
  const savedResponse = (index: number) => ({
    ...initial,
    furniture: structuredClone(saves()[index].config.data.furniture),
  })
  return {
    initial,
    button,
    click,
    type,
    saves,
    savedResponse,
    header: () => document.querySelector("header.app-bar")!,
    text: () => document.body.textContent ?? "",
    async add() {
      await click("배치")
      await click("거실 비어 있어요")
      await click("셸 체어 거실에 놓기")
      expect(saves()).toHaveLength(1)
      await click("닫기")
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300)
      })
    },
    async reject(
      index: number,
      error = new ApiError("저장 연결 실패", null, false)
    ) {
      await act(async () => saves()[index].reject(error))
      await settle()
    },
    async resolve(index: number) {
      await act(async () => saves()[index].resolve(savedResponse(index)))
      await settle()
    },
    async createB() {
      await click("검증 A 프로젝트 메뉴")
      await click("새 프로젝트")
      await type("프로젝트 이름", "검증 B")
      await click("만들기")
      const create = http.calls.find(
        (call) =>
          call.config.url === "/projects" && call.config.method === "POST"
      )!
      expect(create).toBeDefined()
      await act(async () =>
        create.resolve({
          ...structuredClone(initial),
          id: "project-b",
          name: "검증 B",
        })
      )
      await settle()
      expect(document.querySelector("header")?.textContent).toContain("검증 B")
    },
  }
}

describe("save recovery through the real App and SEED UI", () => {
  it("shows manual recovery after automatic network retries are exhausted", async () => {
    const ui = await setup()
    await ui.add()
    await ui.reject(0, new ApiError("연결 끊김", null, true))
    expect(ui.header().textContent).toContain("저장 중")
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    await ui.reject(1, new ApiError("연결 끊김", null, true))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    await ui.reject(2, new ApiError("연결 끊김", null, true))
    expect(ui.saves()).toHaveLength(3)
    expect(ui.button("다시 저장", ui.header()).disabled).toBe(false)
    expect(
      document.querySelector(".inspector-identity")?.textContent
    ).toContain("셸 체어")
  })
  it.each(["pending", "saved"])(
    "ignores the old snackbar retry while the header retry is %s",
    async (state) => {
      const ui = await setup()
      await ui.add()
      await ui.reject(0)
      const snackbarRetry = [
        ...document.querySelectorAll<HTMLButtonElement>("button"),
      ].find(
        (node) =>
          node.textContent?.trim() === "다시 저장" &&
          !ui.header().contains(node)
      )!
      expect(snackbarRetry).toBeDefined()
      await ui.click("다시 저장", ui.header())
      expect(ui.saves()).toHaveLength(2)
      if (state === "saved") await ui.resolve(1)
      await act(async () => snackbarRetry.click())
      await settle()
      if (state === "pending") await ui.resolve(1)
      expect(ui.saves()).toHaveLength(2)
      expect(ui.header().textContent).toContain("저장됨")
    }
  )
  it("keeps a valid restore action after an unrelated export notice", async () => {
    const ui = await setup()
    await ui.add()
    await ui.reject(0, new ApiError("벽과 겹쳐요", 400, false))
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test-export")
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {})
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
    await ui.click("검증 A 프로젝트 메뉴")
    await ui.click("JSON으로 내보내기")
    await ui.click("되돌리기")
    expect(ui.header().textContent).toContain("저장됨")
    expect(ui.saves()).toHaveLength(1)
    await ui.click("내역")
    expect(ui.text()).toContain("아직 놓은 가구가 없어요")
  })
  it("keeps the visible draft after failure and retries the latest edited coordinates once", async () => {
    const ui = await setup()
    await ui.add()
    await ui.reject(0)
    expect(ui.header().textContent).not.toContain("저장됨")
    expect(
      document.querySelector(".inspector-identity")?.textContent
    ).toContain("셸 체어")
    const input = await ui.type("가로", "2.0")
    await act(async () => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      )
    })
    await settle()
    await ui.reject(1)
    const retry = ui.button("다시 저장", ui.header())
    await act(async () => {
      retry.click()
      retry.click()
    })
    await settle()
    expect(ui.saves()).toHaveLength(3)
    expect(ui.saves()[2].config.data.furniture[0].x).toBe(2)
    expect(retry.disabled).toBe(true)
    await ui.resolve(2)
    expect(ui.header().textContent).toContain("저장됨")
    expect(ui.header().textContent).not.toContain("다시 저장")
  })
  it("retries from the error snackbar without duplicating the request", async () => {
    const ui = await setup()
    await ui.add()
    await ui.reject(0)
    const retries = [
      ...document.querySelectorAll<HTMLButtonElement>("button"),
    ].filter(
      (node) =>
        node.textContent?.trim() === "다시 저장" && !ui.header().contains(node)
    )
    expect(retries).toHaveLength(1)
    await act(async () => {
      retries[0].click()
      retries[0].click()
    })
    await settle()
    expect(ui.saves()).toHaveLength(2)
    await ui.resolve(1)
    expect(ui.header().textContent).toContain("저장됨")
  })
  it("restores the last saved furniture after a validation rejection without another write", async () => {
    const ui = await setup()
    await ui.add()
    await ui.reject(0, new ApiError("벽과 겹쳐요", 400, false))
    expect(ui.text()).toContain("이 배치는 저장되지 않았어요")
    await ui.click("저장된 배치로 되돌리기")
    expect(ui.saves()).toHaveLength(1)
    expect(ui.header().textContent).toContain("저장됨")
    await ui.click("내역")
    expect(ui.text()).toContain("아직 놓은 가구가 없어요")
  })
  it("does not let an older project's retry snackbar write the new project", async () => {
    const ui = await setup()
    await ui.add()
    await ui.reject(0)
    await ui.createB()
    const retry = [
      ...document.querySelectorAll<HTMLButtonElement>("button"),
    ].find((node) => node.textContent?.trim() === "다시 저장")!
    expect(retry).toBeDefined()
    await act(async () => retry.click())
    await settle()
    expect(ui.saves()).toHaveLength(1)
    expect(ui.text()).not.toContain("저장했어요.")
  })
})
