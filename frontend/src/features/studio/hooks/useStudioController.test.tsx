import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { beforeEach, describe, expect, it, vi } from "vite-plus/test"

import { sampleProject } from "../data"
import type { ChatCommandResponse, Project } from "../types"
import { ApiError } from "@/lib/http-client"
import { useStudioController } from "./useStudioController"

// The client test environment refuses the shared catalog outside frontend/, so install the DOM before React loads.
await vi.hoisted(async () => {
  const { Window } = await import("happy-dom")
  const window = new Window({ url: "http://localhost/" })
  // Leaving a project with unsaved changes asks first; these tests always confirm.
  Object.assign(window, { confirm: () => true })
  Object.assign(globalThis, {
    window,
    document: window.document,
    localStorage: window.localStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
  })
})

const server = vi.hoisted(() => {
  type Call = {
    arg: unknown
    resolve: (value: unknown) => void
    reject: (error: unknown) => void
  }
  const calls: Record<string, Call[]> = {}
  const fake =
    (name: string) =>
    (arg: unknown): Promise<never> =>
      new Promise((resolve, reject) => {
        ;(calls[name] ??= []).push({
          arg,
          resolve: resolve as Call["resolve"],
          reject,
        })
      })
  return { calls, fake }
})

vi.mock("@/features/studio/project-api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isServerMode: true,
  getProject: server.fake("getProject"),
  saveProject: server.fake("saveProject"),
  createProject: server.fake("createProject"),
  sendCommand: (
    _project: Project,
    _message: string,
    _focus?: unknown,
    furnitureId?: string
  ) => server.fake("sendCommand")({ furnitureId }),
  confirmCommand: (_projectId: string, proposalId: string) =>
    server.fake("confirmCommand")(proposalId),
}))

const projectA: Project = structuredClone(sampleProject)
const projectB: Project = {
  ...structuredClone(sampleProject),
  id: "project-b",
  name: "B",
  furniture: [],
}

function calls(name: string) {
  return server.calls[name] ?? []
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve()
  })
}

async function setup() {
  const result: { current?: ReturnType<typeof useStudioController> } = {}
  function Harness() {
    Object.assign(result, { current: useStudioController() })
    return null
  }
  const root = createRoot(document.createElement("div"))
  act(() =>
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <Harness />
      </QueryClientProvider>
    )
  )
  await flush()
  calls("getProject")[0].resolve(structuredClone(projectA))
  await flush()
  return {
    get: () => result.current!,
    unmount: () => act(() => root.unmount()),
  }
}

beforeEach(() => {
  localStorage.clear()
  for (const name of Object.keys(server.calls)) delete server.calls[name]
})

describe("useStudioController project switching", () => {
  it("reloads A only after A's earlier save finishes, even after visiting B", async () => {
    const app = await setup()
    expect(app.get().project.id).toBe(projectA.id)

    act(() => app.get().addFurniture("sofa-cloud"))
    await flush()
    expect(calls("saveProject")).toHaveLength(1)

    let created!: Promise<boolean>
    act(() => {
      created = app.get().createProject("B")
    })
    await flush()
    calls("createProject")[0].resolve(structuredClone(projectB))
    await flush()
    await expect(created).resolves.toBe(true)
    expect(app.get().project.id).toBe(projectB.id)

    act(() => app.get().openSampleProject())
    await flush()
    // A's save is still in flight, so loading A now would miss that change.
    expect(calls("getProject")).toHaveLength(1)

    const savedA = calls("saveProject")[0].arg as Project
    calls("saveProject")[0].resolve(savedA)
    await flush()
    expect(calls("getProject")).toHaveLength(2)
    calls("getProject")[1].resolve(savedA)
    await flush()
    expect(app.get().project.id).toBe(projectA.id)
    expect(app.get().project.furniture).toHaveLength(
      projectA.furniture.length + 1
    )
    app.unmount()
  })

  it("does not open a created project after the user switched away", async () => {
    const app = await setup()

    let created!: Promise<boolean>
    act(() => {
      created = app.get().createProject("B")
    })
    await flush()

    act(() => app.get().openSampleProject())
    await flush()
    calls("getProject")[1].resolve(structuredClone(projectA))
    await flush()
    expect(app.get().projectLoad.status).toBe("ready")

    calls("createProject")[0].resolve(structuredClone(projectB))
    await flush()
    await expect(created).resolves.toBe(false)
    expect(app.get().project.id).toBe(projectA.id)
    expect(localStorage.getItem("kokoro-active-server-project-v1")).toBe(
      projectA.id
    )
    app.unmount()
  })

  it("does not let a slower load replace a project created after it", async () => {
    const app = await setup()

    act(() => app.get().openSampleProject())
    await flush()
    expect(calls("getProject")).toHaveLength(2)

    let created!: Promise<boolean>
    act(() => {
      created = app.get().createProject("B")
    })
    await flush()
    calls("createProject")[0].resolve(structuredClone(projectB))
    await flush()
    await expect(created).resolves.toBe(true)

    calls("getProject")[1].resolve(structuredClone(projectA))
    await flush()
    expect(app.get().project.id).toBe(projectB.id)
    expect(app.get().projectLoad.status).toBe("ready")
    app.unmount()
  })
})

const clearCommand: ChatCommandResponse["commands"][number] = {
  type: "CLEAR",
  catalogId: null,
  furnitureId: null,
  x: null,
  z: null,
  rotation: null,
}

function previewResponse(project: Project): ChatCommandResponse {
  return {
    reply: "가구를 모두 삭제할까요?",
    project,
    appliedActions: [],
    commands: [clearCommand],
    requiresConfirmation: true,
    proposalId: "proposal-1",
    expiresAt: "2030-01-01T00:00:00Z",
    proposedCommands: [clearCommand],
    candidates: [],
  }
}

async function previewClear(app: Awaited<ReturnType<typeof setup>>) {
  act(() => app.get().sendMessage("전부 삭제"))
  await flush()
  calls("sendCommand")
    .at(-1)!
    .resolve(previewResponse(structuredClone(projectA)))
  await flush()
}

describe("command confirmation", () => {
  it("keeps furniture and undo unchanged before confirmation and after cancel", async () => {
    const app = await setup()
    await previewClear(app)
    expect(app.get().project).toEqual(projectA)
    expect(app.get().project.furniture).toEqual(projectA.furniture)
    expect(app.get().canUndo).toBe(false)
    expect(calls("saveProject")).toHaveLength(0)
    act(() => app.get().cancelCommand())
    expect(app.get().pendingCommand).toBeNull()
    expect(app.get().project).toEqual(projectA)
    expect(app.get().project.furniture).toEqual(projectA.furniture)
    expect(app.get().canUndo).toBe(false)
    expect(calls("confirmCommand")).toHaveLength(0)
    app.unmount()
  })

  it("applies once, ignores duplicate clicks, and adds one undo entry", async () => {
    const app = await setup()
    await previewClear(app)
    act(() => {
      void app.get().confirmPendingCommand()
      void app.get().confirmPendingCommand()
    })
    await flush()
    expect(calls("confirmCommand")).toHaveLength(1)
    expect(calls("confirmCommand")[0].arg).toBe("proposal-1")
    calls("confirmCommand")[0].resolve({
      ...previewResponse({ ...projectA, furniture: [] }),
      reply: "삭제했어요.",
      appliedActions: ["전체 삭제"],
      requiresConfirmation: false,
      proposedCommands: [],
    })
    await flush()
    expect(app.get().project.furniture).toEqual([])
    expect(app.get().canUndo).toBe(true)
    act(() => app.get().undo())
    expect(app.get().project.furniture).toEqual(projectA.furniture)
    app.unmount()
  })

  it("keeps a proposal for network retry and clears it on 409", async () => {
    const app = await setup()
    await previewClear(app)
    act(() => void app.get().confirmPendingCommand())
    await flush()
    calls("confirmCommand")[0].reject(new ApiError("network", null, true))
    await flush()
    expect(app.get().pendingCommand?.response.proposalId).toBe("proposal-1")
    act(() => void app.get().confirmPendingCommand())
    await flush()
    expect(calls("confirmCommand")[1].arg).toBe("proposal-1")
    calls("confirmCommand")[1].reject(new ApiError("expired", 409, false))
    await flush()
    expect(app.get().confirmationError).toContain("다시 요청")
    expect(app.get().project.furniture).toEqual(projectA.furniture)
    app.unmount()
  })

  it("syncs an already applied response after a lost confirmation response", async () => {
    const app = await setup()
    await previewClear(app)
    act(() => void app.get().confirmPendingCommand())
    await flush()
    calls("confirmCommand")[0].reject(new ApiError("network", null, true))
    await flush()
    act(() => void app.get().confirmPendingCommand())
    await flush()
    calls("confirmCommand")[1].resolve({
      ...previewResponse({ ...projectA, furniture: [] }),
      reply: "이미 처리된 요청입니다.",
      appliedActions: [],
      requiresConfirmation: false,
      proposedCommands: [],
    })
    await flush()
    expect(app.get().project.furniture).toEqual([])
    expect(app.get().canUndo).toBe(true)
    expect(app.get().pendingCommand).toBeNull()
    app.unmount()
  })

  it("waits for explicit target selection before sending another command", async () => {
    const app = await setup()
    act(() => app.get().sendMessage("소파를 옮겨줘"))
    await flush()
    calls("sendCommand")[0].resolve({
      ...previewResponse(projectA),
      proposalId: null,
      requiresConfirmation: false,
      proposedCommands: [],
      candidates: [{ furnitureId: "sofa-01", name: "클라우드 소파" }],
    })
    await flush()
    expect(calls("sendCommand")).toHaveLength(1)
    expect(app.get().project.furniture).toEqual(projectA.furniture)
    expect(app.get().canUndo).toBe(false)
    act(() => app.get().chooseCommandTarget("sofa-01"))
    await flush()
    expect(calls("sendCommand")).toHaveLength(2)
    expect(calls("sendCommand")[1].arg).toMatchObject({
      furnitureId: "sofa-01",
    })
    calls("sendCommand")[1].resolve({
      ...previewResponse({
        ...projectA,
        furniture: projectA.furniture.map((item) =>
          item.id === "sofa-01" ? { ...item, x: 3 } : item
        ),
      }),
      reply: "이동했어요.",
      appliedActions: ["이동"],
      requiresConfirmation: false,
      proposalId: null,
      proposedCommands: [],
      candidates: [],
    })
    await flush()
    expect(app.get().project.furniture[0].x).toBe(3)
    expect(app.get().canUndo).toBe(true)
    app.unmount()
  })

  it("blocks a proposal after editing and closes it on project switch", async () => {
    const app = await setup()
    await previewClear(app)
    act(() => app.get().addFurniture("sofa-cloud"))
    expect(app.get().commandStale).toBe(true)
    act(() => void app.get().confirmPendingCommand())
    await flush()
    expect(calls("confirmCommand")).toHaveLength(0)
    act(() => app.get().openSampleProject())
    await flush()
    expect(app.get().pendingCommand).toBeNull()
    app.unmount()
  })
})
