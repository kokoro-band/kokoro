// @vitest-environment happy-dom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, afterAll, expect, it, vi } from "vite-plus/test"
import type { AxiosRequestConfig } from "axios"
import { ApiError } from "@/lib/http-client"
import { catalog, sampleProject } from "../data"
import type { CommandResponse, Project } from "../types"
import { useStudioController } from "./useStudioController"

const http = vi.hoisted(() => {
  vi.stubEnv("VITE_API_MODE", "server")
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
  for (const cleanup of cleanups.splice(0)) cleanup()
  http.calls.length = 0
  localStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
afterAll(() => vi.unstubAllEnvs())
async function flush() {
  await act(async () => {
    for (let i = 0; i < 30; i++) await Promise.resolve()
  })
}
function response(
  project: Project,
  extra: Partial<CommandResponse> = {}
): CommandResponse {
  return {
    project,
    reply: "확인해 주세요",
    commands: [],
    appliedActions: [],
    requiresConfirmation: false,
    proposalId: null,
    expiresAt: null,
    proposedCommands: [],
    candidates: [],
    ...extra,
  }
}
async function setup() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.stubGlobal("confirm", () => true)
  const initial = { ...structuredClone(sampleProject), revision: 0 }
  const result: { current?: ReturnType<typeof useStudioController> } = {}
  function Harness() {
    Object.assign(result, { current: useStudioController() })
    return null
  }
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const root = createRoot(document.createElement("div"))
  cleanups.push(() => {
    act(() => root.unmount())
    client.clear()
  })
  act(() =>
    root.render(
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>
    )
  )
  await flush()
  http.calls[0].resolve(initial)
  await flush()
  async function propose(extra: Partial<CommandResponse> = {}) {
    act(() => result.current!.sendMessage("방을 비워줘"))
    await flush()
    http.calls.at(-1)!.resolve(
      response(initial, {
        requiresConfirmation: true,
        proposalId: "proposal-1",
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
        proposedCommands: [{ type: "CLEAR" }],
        ...extra,
      })
    )
    await flush()
  }
  return { get: () => result.current!, initial, propose }
}

const intent = { version: 1, intents: [{ type: "CLEAR" }] }
async function ollamaProposal(modelIntent = intent) {
  const app = await setup()
  const fetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        message: { content: JSON.stringify(modelIntent) },
      })
    )
  )
  vi.stubGlobal("fetch", fetch)
  act(() => app.get().setAssistantEngine("ollama"))
  act(() => app.get().sendMessage("방을 비워줘"))
  await flush()
  expect(http.calls[1].config.url).toBe("/furniture-catalog")
  http.calls[1].resolve({
    version: 1,
    unit: "m",
    priceKind: "example",
    currency: "KRW",
    items: catalog,
  })
  await flush()
  expect(fetch).toHaveBeenCalledOnce()
  expect(http.calls[2].config).toMatchObject({
    url: `/projects/${app.initial.id}/layout/intents`,
    method: "POST",
    data: { intent: modelIntent, expectedRevision: 0 },
  })
  return { ...app, fetch }
}
function preview(project: Project, extra: Partial<CommandResponse> = {}) {
  return response(project, {
    requiresConfirmation: true,
    proposalId: "ollama-proposal",
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
    proposedCommands: [{ type: "CLEAR" }],
    ...extra,
  })
}
it("sends a validated Ollama intent to the server and cancels without changing the layout", async () => {
  const app = await ollamaProposal()
  http.calls[2].resolve(preview(app.initial))
  await flush()
  expect(app.get().project).toEqual(app.initial)
  act(() => app.get().cancelCommandReview())
  expect(app.get().commandReview).toBeNull()
  expect(app.get().canUndo).toBe(false)
  expect(http.calls).toHaveLength(3)
})
it("locks edits synchronously during confirmation and keeps them locked after response loss", async () => {
  const app = await setup()
  await app.propose()
  act(() => app.get().selectFurniture(app.initial.furniture[0].id))
  act(() => {
    app.get().confirmCommandReview()
    app.get().addFurniture("chair-shell")
    app.get().updateSelected({ rotation: 90 })
    app.get().moveFurniture(app.initial.furniture[0].id, 1, 1)
    app.get().commitPreview()
    app.get().deleteSelected()
    app.get().redo()
    app
      .get()
      .uploadFloorPlan(
        new File(["pdf"], "plan.pdf", { type: "application/pdf" })
      )
    void app.get().createProject("another project")
    app.get().openSampleProject()
    app.get().undo()
    void app
      .get()
      .applyRoom({ ...app.initial.room!, bounds: { width: 20, depth: 20 } })
    app.get().saveProject()
  })
  await flush()
  expect(app.get().project).toEqual(app.initial)
  expect(http.calls).toHaveLength(3)
  expect(http.calls[2].config.url).toContain("/confirm")
  expect(app.get().editingLocked).toBe(true)
  http.calls[2].reject(new ApiError("연결 끊김", null, true))
  await flush()
  act(() => {
    app.get().cancelCommandReview()
    app.get().addFurniture("chair-shell")
    app.get().requestCommandAgain()
  })
  await flush()
  expect(app.get().commandReview?.status).toBe("retry")
  expect(app.get().project).toEqual(app.initial)
  expect(http.calls).toHaveLength(3)
  act(() => app.get().confirmCommandReview())
  await flush()
  expect(http.calls[3].config.data).toEqual({ proposalId: "proposal-1" })
  http.calls[3].resolve(
    response({ ...app.initial, revision: 1, furniture: [] })
  )
  await flush()
  expect(app.get().project.furniture).toEqual([])
  act(() => app.get().addFurniture("chair-shell"))
  expect(app.get().project.furniture).toHaveLength(1)
})
it("reuses the model intent for candidate selection without running Ollama again", async () => {
  const remove = {
    version: 1,
    intents: [{ type: "REMOVE", targetQuery: "소파" }],
  }
  const app = await ollamaProposal(remove)
  const item = app.initial.furniture[0]
  http.calls[2].resolve(
    response(app.initial, {
      reply: "1번째 명령의 대상을 선택해 주세요.",
      candidates: [{ furnitureId: item.id, name: item.name }],
    })
  )
  await flush()
  act(() => app.get().chooseCommandCandidate(item.id))
  await flush()
  expect(app.fetch).toHaveBeenCalledOnce()
  expect(http.calls[3].config.data).toEqual({
    intent: remove,
    selections: { "0": item.id },
    expectedRevision: 0,
  })
})
it("keeps model errors out of the intent API and retains the request for retry", async () => {
  const app = await setup()
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ message: { content: "not JSON" } }))
    )
  vi.stubGlobal("fetch", fetch)
  act(() => app.get().setAssistantEngine("ollama"))
  act(() => app.get().sendMessage("방을 비워줘"))
  await flush()
  expect(http.calls[1].config.url).toBe("/furniture-catalog")
  http.calls[1].resolve({
    version: 1,
    unit: "m",
    priceKind: "example",
    currency: "KRW",
    items: catalog,
  })
  await flush()
  expect(app.get().project).toEqual(app.initial)
  expect(app.get().input).toBe("방을 비워줘")
  expect(app.get().messages.at(-1)?.text).toContain("이해할 수 없는 답")
  expect(http.calls).toHaveLength(2)
})

it("ignores a model reply delivered after stop and allows a fresh request", async () => {
  const app = await setup()
  let finish!: (value: Response) => void
  const fetch = vi.fn().mockImplementation(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve
      })
  )
  vi.stubGlobal("fetch", fetch)
  act(() => app.get().setAssistantEngine("ollama"))
  act(() => app.get().sendMessage("방을 비워줘"))
  await flush()
  http.calls[1].resolve({
    version: 1,
    unit: "m",
    priceKind: "example",
    currency: "KRW",
    items: catalog,
  })
  await flush()
  act(() => app.get().stopBrowserAi())
  finish(
    new Response(
      JSON.stringify({ message: { content: JSON.stringify(intent) } })
    )
  )
  await flush()
  expect(http.calls).toHaveLength(2)
  expect(app.get().project).toEqual(app.initial)
  expect(app.get().busy).toBeNull()
  expect(app.get().input).toBe("방을 비워줘")
  expect(app.get().notice?.text).toContain("중단")
  act(() => app.get().sendMessage("방을 비워줘"))
  await flush()
  expect(http.calls[2].config.url).toBe("/furniture-catalog")
})
it("aborts model inference on unmount without sending a late intent", async () => {
  const app = await setup()
  let finish!: (value: Response) => void
  let signal!: AbortSignal
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((_url, options) => {
      signal = options.signal
      return new Promise<Response>((resolve) => {
        finish = resolve
      })
    })
  )
  act(() => app.get().setAssistantEngine("ollama"))
  act(() => app.get().sendMessage("방을 비워줘"))
  await flush()
  http.calls[1].resolve({
    version: 1,
    unit: "m",
    priceKind: "example",
    currency: "KRW",
    items: catalog,
  })
  await flush()
  cleanups.shift()!()
  expect(signal.aborted).toBe(true)
  finish(
    new Response(
      JSON.stringify({ message: { content: JSON.stringify(intent) } })
    )
  )
  await flush()
  expect(http.calls).toHaveLength(2)
})
it("keeps selections for each ambiguous command in a multi-intent request", async () => {
  const multi = {
    version: 1,
    intents: [
      { type: "REMOVE", targetQuery: "소파" },
      { type: "ROTATE", targetQuery: "화분", rotation: 90 },
    ],
  }
  const app = await ollamaProposal(multi)
  const [one, two] = app.initial.furniture
  http.calls[2].resolve(
    response(app.initial, {
      reply: "1번째 명령의 대상을 선택해 주세요.",
      candidates: [{ furnitureId: one.id, name: one.name }],
    })
  )
  await flush()
  act(() => app.get().chooseCommandCandidate(one.id))
  await flush()
  http.calls[3].resolve(
    response(app.initial, {
      reply: "2번째 명령의 대상을 선택해 주세요.",
      candidates: [{ furnitureId: two.id, name: two.name }],
    })
  )
  await flush()
  act(() => app.get().chooseCommandCandidate(two.id))
  await flush()
  expect(http.calls[4].config.data).toEqual({
    intent: multi,
    selections: { "0": one.id, "1": two.id },
    expectedRevision: 0,
  })
  expect(app.fetch).toHaveBeenCalledOnce()
})
it("does not guess the candidate command when a multi-intent reply has no index", async () => {
  const multi = {
    version: 1,
    intents: [
      { type: "REMOVE", targetQuery: "소파" },
      { type: "REMOVE", targetQuery: "화분" },
    ],
  }
  const app = await ollamaProposal(multi)
  const item = app.initial.furniture[0]
  http.calls[2].resolve(
    response(app.initial, {
      candidates: [{ furnitureId: item.id, name: item.name }],
    })
  )
  await flush()
  expect(app.get().commandReview).toBeNull()
  expect(app.get().project).toEqual(app.initial)
  expect(app.get().messages.at(-1)?.text).toContain("한 가구씩")
})

it("clears model progress when switching projects and ignores the old reply", async () => {
  const app = await setup()
  let finish!: (value: Response) => void
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve
        })
    )
  )
  act(() => app.get().setAssistantEngine("ollama"))
  act(() => app.get().sendMessage("방을 비워줘"))
  await flush()
  http.calls[1].resolve({
    version: 1,
    unit: "m",
    priceKind: "example",
    currency: "KRW",
    items: catalog,
  })
  await flush()
  expect(app.get().browserAiStatus).not.toBe("")
  act(() => {
    void app.get().createProject("B")
  })
  await flush()
  const second = { ...app.initial, id: "project-b", furniture: [] }
  http.calls[2].resolve(second)
  await flush()
  expect(app.get().project).toEqual(second)
  expect(app.get().browserAiStatus).toBe("")
  finish(
    new Response(
      JSON.stringify({ message: { content: JSON.stringify(intent) } })
    )
  )
  await flush()
  expect(http.calls).toHaveLength(3)
  expect(app.get().commandReview).toBeNull()
  expect(app.get().project).toEqual(second)
})

it("preserves the layout and request when the server rejects the model intent", async () => {
  const app = await ollamaProposal()
  http.calls[2].reject(
    new ApiError("상대 위치 지정은 아직 지원하지 않습니다.", 400, false)
  )
  await flush()
  expect(app.get().project).toEqual(app.initial)
  expect(app.get().commandReview).toBeNull()
  expect(app.get().input).toBe("방을 비워줘")
  expect(app.get().messages.at(-1)?.text).toContain("아직 지원하지")
  expect(app.get().busy).toBeNull()
})
it("rejects an intent response that changes furniture before confirmation", async () => {
  const app = await ollamaProposal()
  http.calls[2].resolve(preview({ ...app.initial, furniture: [] }))
  await flush()
  expect(app.get().project).toEqual(app.initial)
  expect(app.get().commandReview).toBeNull()
  expect(app.get().messages.at(-1)?.text).toContain("배치가 달라")
  expect(app.get().canUndo).toBe(false)
})
it("stops a pending catalog request before any model or intent request", async () => {
  const app = await setup()
  const fetch = vi.fn()
  vi.stubGlobal("fetch", fetch)
  act(() => app.get().setAssistantEngine("ollama"))
  act(() => app.get().sendMessage("방을 비워줘"))
  await flush()
  act(() => app.get().stopBrowserAi())
  http.calls[1].resolve({
    version: 1,
    unit: "m",
    priceKind: "example",
    currency: "KRW",
    items: catalog,
  })
  await flush()
  expect(fetch).not.toHaveBeenCalled()
  expect(http.calls).toHaveLength(2)
  expect(app.get().project).toEqual(app.initial)
  expect(app.get().busy).toBeNull()
})
