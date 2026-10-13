// @vitest-environment happy-dom
import { act, useEffect } from "react"
import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, afterAll, expect, it, vi } from "vite-plus/test"
import type { AxiosRequestConfig } from "axios"
import { sampleProject } from "../data"
import { AssistantPanel } from "../components/AssistantPanel"
import { useStudioController } from "./useStudioController"

const http = vi.hoisted(() => {
  vi.stubEnv("VITE_API_MODE", "local")
  const calls: {
    config: AxiosRequestConfig
    resolve: (value: unknown) => void
    reject: (error: Error) => void
  }[] = []
  return {
    calls,
    request: (config: AxiosRequestConfig) =>
      new Promise((resolve, reject) => calls.push({ config, resolve, reject })),
  }
})
vi.mock("@/lib/http-client", async (original) => ({
  ...(await original<object>()),
  request: http.request,
}))
const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  http.calls.length = 0
  localStorage.clear()
  vi.unstubAllGlobals()
})
afterAll(() => vi.unstubAllEnvs())
async function flush() {
  await act(async () => {
    for (let i = 0; i < 40; i++) await Promise.resolve()
  })
}
async function setup() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  const initial = structuredClone(sampleProject)
  const baseline = JSON.stringify(initial)
  localStorage.setItem("kokoro-remodel-project-v1", baseline)
  const result: { current?: ReturnType<typeof useStudioController> } = {}
  function Harness() {
    const app = useStudioController()
    useEffect(() => {
      result.current = app
    }, [app])
    return (
      <AssistantPanel
        messages={app.messages}
        input={app.input}
        roomName={null}
        chatBusy={app.busy === "chat"}
        busy={Boolean(app.busy)}
        engine={app.assistantEngine}
        onEngineChange={app.setAssistantEngine}
        onStopAi={app.stopBrowserAi}
        onInputChange={app.setInput}
        onSend={app.sendMessage}
      />
    )
  }
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const element = document.createElement("div")
  document.body.append(element)
  const root = createRoot(element)
  cleanups.push(() => {
    act(() => root.unmount())
    client.clear()
    element.remove()
  })
  act(() =>
    root.render(
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>
    )
  )
  await flush()
  const button = [...element.querySelectorAll("button")].find(
    (item) => item.textContent === "외부 AI로 해석"
  )
  expect(button, "explicit external AI choice").toBeDefined()
  act(() => button!.click())
  await flush()
  return { get: () => result.current!, baseline, initial, element }
}
const clear = {
  action: "CLEAR",
  catalogId: null,
  placement: null,
  rotation: null,
  anchorCatalogId: null,
}

it("sends only compact context and waits for confirmation before writing", async () => {
  const app = await setup()
  act(() => app.get().sendMessage("방을 비워줘"))
  await flush()
  expect(http.calls).toHaveLength(1)
  expect(http.calls[0].config.url).toBe("/ai/layout-intent")
  expect(http.calls[0].config.data).toEqual({
    message: "방을 비워줘",
    furniture: app.initial.furniture.map(({ catalogId, name }) => ({
      catalogId,
      name,
    })),
  })
  http.calls[0].resolve(clear)
  await flush()
  expect(app.get().commandReview?.response.requiresConfirmation).toBe(true)
  expect(localStorage.getItem("kokoro-remodel-project-v1")).toBe(app.baseline)
  act(() => app.get().confirmCommandReview())
  await flush()
  expect(app.get().project.furniture).toEqual([])
  expect(http.calls).toHaveLength(1)
})

it("cancellation aborts the request and a late response cannot create a proposal", async () => {
  const app = await setup()
  act(() => app.get().sendMessage("방을 비워줘"))
  await flush()
  expect(http.calls).toHaveLength(1)
  act(() => app.get().stopBrowserAi())
  await flush()
  expect(http.calls[0].config.signal?.aborted).toBe(true)
  http.calls[0].resolve(clear)
  await flush()
  expect(app.get().commandReview).toBeNull()
  expect(app.get().busy).toBeNull()
  expect(localStorage.getItem("kokoro-remodel-project-v1")).toBe(app.baseline)
  act(() => app.get().sendMessage("방을 비워줘"))
  await flush()
  expect(http.calls).toHaveLength(2)
})

it("can stop a queued cloud request before the HTTP call starts", async () => {
  const app = await setup()
  act(() => {
    app.get().sendMessage("방을 비워줘")
    app.get().stopBrowserAi()
  })
  await flush()
  expect(http.calls).toHaveLength(0)
  expect(app.get().busy).toBeNull()
  expect(app.get().commandReview).toBeNull()
  expect(localStorage.getItem("kokoro-remodel-project-v1")).toBe(app.baseline)
})

it("bad response does not write or silently run another engine", async () => {
  const app = await setup()
  act(() => app.get().sendMessage("방을 비워줘"))
  await flush()
  http.calls[0].resolve({ ...clear, catalogId: "sofa-cloud" })
  await flush()
  expect(app.get().commandReview).toBeNull()
  expect(app.get().project).toEqual(app.initial)
  expect(app.get().input).toBe("방을 비워줘")
  expect(http.calls).toHaveLength(1)
  expect(localStorage.getItem("kokoro-remodel-project-v1")).toBe(app.baseline)
})

it("uses a validated cloud angle even when the user describes it without digits", async () => {
  const app = await setup()
  act(() => app.get().sendMessage("의자를 직각으로 돌려줘"))
  await flush()
  http.calls[0].resolve({
    action: "ROTATE",
    catalogId: "chair-shell",
    placement: null,
    rotation: 90,
    anchorCatalogId: null,
  })
  await flush()
  expect(app.get().commandReview?.response.requiresConfirmation).toBe(true)
  expect(localStorage.getItem("kokoro-remodel-project-v1")).toBe(app.baseline)
  act(() => app.get().confirmCommandReview())
  await flush()
  expect(
    app.get().project.furniture.find((item) => item.catalogId === "chair-shell")
      ?.rotation
  ).toBe(90)
})
