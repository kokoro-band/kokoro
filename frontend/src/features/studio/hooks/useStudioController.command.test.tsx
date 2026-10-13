// @vitest-environment happy-dom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, afterAll, expect, it, vi } from "vite-plus/test"
import type { AxiosRequestConfig } from "axios"
import { ApiError } from "@/lib/http-client"
import { sampleProject } from "../data"
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

it("keeps proposal and cancel out of furniture, undo history and layout writes", async () => {
  const app = await setup()
  await app.propose()
  expect(app.get().commandReview?.response.proposalId).toBe("proposal-1")
  expect(app.get().project).toEqual(app.initial)
  expect(app.get().canUndo).toBe(false)
  act(() => app.get().cancelCommandReview())
  expect(app.get().commandReview).toBeNull()
  expect(app.get().canUndo).toBe(false)
  expect(http.calls).toHaveLength(2)
})
it("sends only a proposal ID once and records one undo step after confirmation", async () => {
  const app = await setup()
  await app.propose()
  expect(app.get().commandReview).toBeDefined()
  act(() => {
    app.get().confirmCommandReview()
    app.get().confirmCommandReview()
  })
  await flush()
  expect(http.calls).toHaveLength(3)
  expect(http.calls[2].config).toMatchObject({
    url: `/projects/${app.initial.id}/layout/commands/confirm`,
    data: { proposalId: "proposal-1" },
  })
  act(() => app.get().cancelCommandReview())
  expect(app.get().commandReview).not.toBeNull()
  http.calls[2].resolve(
    response({ ...app.initial, furniture: [] }, { appliedActions: ["삭제"] })
  )
  await flush()
  expect(app.get().commandReview).toBeNull()
  expect(app.get().project.furniture).toEqual([])
  act(() => app.get().undo())
  expect(app.get().project.furniture).toEqual(app.initial.furniture)
  expect(app.get().canUndo).toBe(false)
})
it("retries a lost confirmation with the same ID and synchronizes already-applied results", async () => {
  const app = await setup()
  await app.propose()
  expect(app.get().commandReview).toBeDefined()
  act(() => app.get().confirmCommandReview())
  await flush()
  http.calls[2].reject(new ApiError("연결 끊김", null, true))
  await flush()
  expect(app.get().commandReview?.status).toBe("retry")
  expect(app.get().project.furniture).toEqual(app.initial.furniture)
  // A consumed server proposal remains idempotent even after its original TTL.
  const afterExpiry = Date.now() + 300_001
  vi.spyOn(Date, "now").mockReturnValue(afterExpiry)
  act(() => app.get().confirmCommandReview())
  await flush()
  expect(http.calls[3].config.data).toEqual({ proposalId: "proposal-1" })
  http.calls[3].resolve(
    response(
      { ...app.initial, furniture: [] },
      { reply: "이미 처리된 요청입니다." }
    )
  )
  await flush()
  expect(app.get().project.furniture).toEqual([])
  expect(app.get().canUndo).toBe(true)
})
it("preserves the draft when an idempotent confirmation returns an externally changed room", async () => {
  const app = await setup()
  await app.propose()
  act(() => app.get().confirmCommandReview())
  await flush()
  http.calls[2].reject(new ApiError("연결 끊김", null, true))
  await flush()
  act(() => app.get().confirmCommandReview())
  await flush()
  expect(http.calls[3].config.data).toEqual({ proposalId: "proposal-1" })
  http.calls[3].resolve(
    response({
      ...app.initial,
      revision: 3,
      furniture: [],
      room: { ...app.initial.room!, bounds: { width: 20, depth: 20 } },
    })
  )
  await flush()
  expect(app.get().conflict).toMatchObject({ status: "idle", open: true })
  expect(app.get().project).toEqual(app.initial)
  expect(app.get().conflict?.base.revision).toBe(0)
})
it("does not confirm after a preview is invalidated by a furniture edit", async () => {
  const app = await setup()
  await app.propose()
  expect(app.get().commandReview).toBeDefined()
  act(() => app.get().addFurniture("chair-shell"))
  await flush()
  act(() => app.get().confirmCommandReview())
  await flush()
  expect(
    http.calls.filter((call) => call.config.url?.endsWith("/confirm"))
  ).toHaveLength(0)
  expect(app.get().commandReview?.status).toBe("stale")
})
it("routes an expired or stale server proposal to conflict recovery without another confirmation", async () => {
  const app = await setup()
  await app.propose()
  expect(app.get().commandReview).toBeDefined()
  act(() => app.get().confirmCommandReview())
  await flush()
  http.calls[2].reject(new ApiError("만료", 409, false))
  await flush()
  expect(app.get().commandReview).toBeNull()
  expect(app.get().conflict).toMatchObject({ status: "idle", open: true })
  act(() => app.get().confirmCommandReview())
  await flush()
  expect(http.calls).toHaveLength(3)
})
it("resubmits the original text with only a valid candidate ID", async () => {
  const app = await setup()
  const item = app.initial.furniture[0]
  await app.propose({
    requiresConfirmation: false,
    proposedCommands: [],
    proposalId: null,
    candidates: [{ furnitureId: item.id, name: item.name }],
  })
  expect(app.get().commandReview).toBeDefined()
  act(() => app.get().chooseCommandCandidate("not-a-candidate"))
  await flush()
  expect(http.calls).toHaveLength(2)
  act(() => app.get().chooseCommandCandidate(item.id))
  await flush()
  expect(http.calls[2].config.data).toEqual({
    message: "방을 비워줘",
    expectedRevision: 0,
    furnitureId: item.id,
  })
})
it("ignores an old command result and cleanup after opening another project", async () => {
  const app = await setup()
  act(() => app.get().sendMessage("방을 비워줘"))
  await flush()
  act(() => {
    void app.get().createProject("B")
  })
  await flush()
  const second = { ...app.initial, id: "project-b", furniture: [] }
  http.calls[2].resolve(second)
  await flush()
  act(() => app.get().sendMessage("의자를 놓아줘"))
  await flush()
  http.calls[1].resolve(
    response(app.initial, { requiresConfirmation: true, proposalId: "old" })
  )
  await flush()
  expect(app.get().project.id).toBe(second.id)
  expect(app.get().commandReview).toBeNull()
  expect(app.get().busy).toBe("chat")
})

it("checks the snapshot again when a queued confirmation finally starts", async () => {
  const app = await setup()
  await app.propose()
  act(() => app.get().saveProject())
  await flush()
  // Save is busy, so start the review only after it completes.
  http.calls[2].resolve(app.initial)
  await flush()
  act(() => {
    app.get().confirmCommandReview()
    app.get().addFurniture("chair-shell")
  })
  await flush()
  expect(
    http.calls.filter((call) => call.config.url?.endsWith("/confirm"))
  ).toHaveLength(0)
  expect(app.get().commandReview?.status).toBe("stale")
})

it("fails closed for an incomplete confirmation response", async () => {
  const app = await setup()
  await app.propose({
    proposalId: null,
    project: { ...app.initial, furniture: [] },
  })
  expect(app.get().project).toEqual(app.initial)
  expect(app.get().commandReview).toBeNull()
  expect(app.get().canUndo).toBe(false)
  expect(app.get().input).toBe("방을 비워줘")
  expect(http.calls).toHaveLength(2)
})

it("does not send expired proposals and requests a fresh preview explicitly", async () => {
  const app = await setup()
  await app.propose({ expiresAt: new Date(Date.now() - 1).toISOString() })
  act(() => app.get().confirmCommandReview())
  await flush()
  expect(http.calls).toHaveLength(2)
  expect(app.get().commandReview?.status).toBe("stale")
  act(() => app.get().requestCommandAgain())
  await flush()
  expect(http.calls[2].config.data).toEqual({
    message: "방을 비워줘",
    expectedRevision: 0,
  })
  expect(http.calls[2].config.url).toBe(
    `/projects/${app.initial.id}/layout/commands`
  )
})
