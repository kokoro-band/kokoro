import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { ApiError } from "@/lib/http-client"

import { sampleProject } from "../data"
import type { Project } from "../types"
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
  uploadPlan: server.fake("uploadPlan"),
  saveRoom: server.fake("saveRoom"),
  sendCommand: server.fake("sendCommand"),
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

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  vi.restoreAllMocks()
})

async function setup(initialProject: Project = projectA) {
  const result: { current?: ReturnType<typeof useStudioController> } = {}
  function Harness() {
    Object.assign(result, { current: useStudioController() })
    return null
  }
  const root = createRoot(document.createElement("div"))
  const client = new QueryClient()
  let mounted = true
  const unmount = () => {
    if (!mounted) return
    act(() => root.unmount())
    client.clear()
    mounted = false
  }
  cleanups.push(unmount)
  act(() =>
    root.render(
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>
    )
  )
  await flush()
  calls("getProject")[0].resolve(structuredClone(initialProject))
  await flush()
  return {
    get: () => result.current!,
    unmount,
  }
}

beforeEach(() => {
  localStorage.clear()
  for (const name of Object.keys(server.calls)) delete server.calls[name]
})

describe("useStudioController project switching", () => {
  it("keeps the chat draft and history when a request exceeds the input limit", async () => {
    const app = await setup()
    const input = "가".repeat(1001)
    act(() => app.get().setInput(input))
    const messages = app.get().messages
    const project = app.get().project
    act(() => app.get().sendMessage(input))
    await flush()
    expect(app.get().input).toBe(input)
    expect(app.get().messages).toEqual(messages)
    expect(app.get().project).toEqual(project)
    expect(app.get().busy).toBeNull()
    expect(calls("sendCommand")).toHaveLength(0)
    expect(app.get().notice).toMatchObject({ text: expect.stringContaining("1000") })
  })

  it("rejects an invalid name before starting project navigation", async () => {
    const app = await setup()
    const project = app.get().project
    act(() => { void app.get().createProject("가".repeat(81)) })
    await flush()
    expect(calls("createProject")).toHaveLength(0)
    expect(app.get().project).toEqual(project)
    expect(app.get().busy).toBeNull()
  })

  it("serializes wall-constrained drags without losing the latest draft or undo boundaries", async () => {
    const initial: Project = {
      ...structuredClone(projectA),
      dimensions: { width: 6, depth: 6, height: 2.4 },
      room: {
        version: 2,
        unit: "m",
        wallHeight: 2.4,
        bounds: { width: 6, depth: 6 },
        outline: [
          [0, 0],
          [6, 0],
          [6, 6],
          [0, 6],
        ],
        walls: [{ id: "divider", a: [3, 0], b: [3, 6], thickness: 0.2 }],
        openings: [],
        rooms: [],
      },
      furniture: [
        {
          id: "chair",
          catalogId: "chair-shell",
          name: "의자",
          category: "의자",
          x: 1,
          z: 2,
          rotation: 0,
          color: "#000",
        },
      ],
    }
    const app = await setup(initial)
    act(() => {
      app.get().moveFurniture("chair", 5, 2)
      app.get().moveFurniture("chair", 5, 2)
      app.get().commitPreview()
    })
    await flush()
    const first = calls("saveProject")[0].arg as Project
    expect(first.furniture[0].x).toBeCloseTo(2.575, 5)
    act(() => {
      app.get().moveFurniture("chair", 5, 3)
      app.get().commitPreview()
    })
    await flush()
    expect(calls("saveProject")).toHaveLength(1)
    expect(app.get().project.furniture[0].z).toBe(3)
    calls("saveProject")[0].resolve(first)
    await flush()
    expect(calls("saveProject")).toHaveLength(2)
    const second = calls("saveProject")[1].arg as Project
    expect(second.furniture[0].x).toBeCloseTo(2.575, 5)
    expect(second.furniture[0].z).toBe(3)
    calls("saveProject")[1].resolve(second)
    await flush()
    expect(app.get().dirty).toBe(false)
    act(() => app.get().undo())
    expect(app.get().project.furniture[0].z).toBe(2)
    act(() => app.get().undo())
    expect(app.get().project.furniture[0].x).toBe(1)
    expect(app.get().canUndo).toBe(false)
    await flush()
    calls("saveProject")[2].resolve(calls("saveProject")[2].arg)
    await flush()
  })
  it("ignores a restore action from an older project's error notice", async () => {
    const app = await setup()
    act(() => app.get().addFurniture("sofa-cloud"))
    await flush()
    calls("saveProject")[0].reject(new ApiError("거부", 400, false))
    await flush()
    const oldNoticeId = app.get().notice!.id
    act(() => {
      void app.get().createProject("B")
    })
    await flush()
    calls("createProject")[0].resolve(structuredClone(projectB))
    await flush()
    act(() => app.get().addFurniture("chair-shell"))
    await flush()
    calls("saveProject")[1].reject(new ApiError("거부", 400, false))
    await flush()
    const draft = app.get().project.furniture
    act(() => app.get().restoreSavedProject(oldNoticeId))
    expect(app.get().project.furniture).toEqual(draft)
    act(() => app.get().restoreSavedProject(app.get().notice!.id))
    expect(app.get().project.furniture).toEqual(projectB.furniture)
  })
  it("does not restore an old snapshot while a newer save is in flight", async () => {
    const app = await setup()
    act(() => app.get().addFurniture("sofa-cloud"))
    await flush()
    calls("saveProject")[0].reject(new ApiError("거부", 400, false))
    await flush()
    expect(app.get().saveRejected).toBe(true)
    act(() => app.get().addFurniture("chair-shell"))
    await flush()
    const draft = app.get().project.furniture
    expect(calls("saveProject")).toHaveLength(2)
    act(() => app.get().restoreSavedProject())
    expect(app.get().project.furniture).toEqual(draft)
    calls("saveProject")[1].resolve(calls("saveProject")[1].arg)
    await flush()
    expect(app.get().project.furniture).toEqual(draft)
    expect(app.get().dirty).toBe(false)
  })

  it("keeps a newer room when an older upload status read completes", async () => {
    const app = await setup()
    const uploaded = {
      ...structuredClone(projectA),
      floorPlan: { ...projectA.floorPlan, status: "PROCESSING", progress: 50 },
    }
    act(() =>
      app
        .get()
        .uploadFloorPlan(
          new window.File(["plan"], "plan.png", { type: "image/png" })
        )
    )
    await act(async () => {
      await vi.waitFor(() => expect(calls("uploadPlan")).toHaveLength(1))
    })
    calls("uploadPlan")[0].resolve(uploaded)
    await flush()
    await act(async () => {
      await vi.waitFor(() => expect(calls("getProject")).toHaveLength(2))
    })
    const room = { ...structuredClone(projectA.room!), wallHeight: 3.1 }
    let applying!: Promise<boolean>
    act(() => {
      applying = app.get().applyRoom(room)
    })
    await flush()
    expect(calls("saveRoom")).toHaveLength(1)
    calls("saveRoom")[0].resolve({ ...uploaded, room })
    await flush()
    await expect(applying).resolves.toBe(true)
    calls("getProject")[1].resolve({
      ...uploaded,
      floorPlan: { ...uploaded.floorPlan, status: "READY", progress: 100 },
    })
    await flush()
    expect(app.get().project.room).toEqual(room)
    expect(app.get().project.floorPlan.status).toBe("READY")
    expect(app.get().notice?.text).toContain("파일 처리가 끝났어요")
    expect(app.get().notice?.text).not.toContain("로컬 데모")
  })
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
