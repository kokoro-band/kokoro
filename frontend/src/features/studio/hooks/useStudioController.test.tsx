import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { beforeEach, describe, expect, it, vi } from "vite-plus/test"

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
