import { beforeEach, describe, expect, it, vi } from "vite-plus/test"

import { request, UPLOAD_TIMEOUT_MS } from "@/lib/http-client"

import { sampleProject } from "./data"
import { sampleRoom } from "./sample-room"

vi.mock("@/lib/http-client", () => ({
  request: vi.fn(),
  UPLOAD_TIMEOUT_MS: 60_000,
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  vi.stubEnv("VITE_API_MODE", "server")
  vi.mocked(request).mockImplementation(async (config) =>
    config.url?.endsWith("/commands")
      ? { project: { ...sampleProject, revision: 0 } }
      : { ...sampleProject, revision: 0 }
  )
})

describe("project API paths", () => {
  it("starts a new local project empty and preserves repairable furniture across room save and reload", async () => {
    vi.stubEnv("VITE_API_MODE", "local")
    const storage = new Map<string, string>()
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    })
    try {
      const { createProject, saveRoom, saveProject, readSavedProject } =
        await import("./project-api")
      const empty = await createProject("빈 프로젝트")
      expect(empty.furniture).toEqual([])
      await saveRoom(empty, sampleRoom)
      expect(readSavedProject().furniture).toEqual([])
      const draft = {
        ...empty,
        furniture: [{ ...sampleProject.furniture[0], x: 30, z: 30 }],
      }
      const saved = await saveRoom(draft, sampleRoom)
      expect(saved.furniture).toEqual(draft.furniture)
      await saveProject({
        ...saved,
        furniture: [{ ...saved.furniture[0], x: 4 }],
      })
      expect(readSavedProject().furniture[0]).toMatchObject({ x: 4, z: 30 })
      expect(readSavedProject().room).toEqual(sampleRoom)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("rejects IDs that can change the request path", async () => {
    const { getProject } = await import("./project-api")

    for (const projectId of ["../admin", "a/b", "abc?x=1", "abc#details"]) {
      expect(() => getProject(projectId)).toThrow("프로젝트 ID")
    }
    expect(request).not.toHaveBeenCalled()
  })

  it("uses validated project paths for every project request", async () => {
    const { getProject, saveProject, saveRoom, sendCommand, uploadPlan } =
      await import("./project-api")
    const project = { ...structuredClone(sampleProject), revision: 0 }
    const file = new File(["plan"], "plan.pdf", { type: "application/pdf" })

    await getProject(project.id)
    await saveProject(project)
    await saveRoom(project, sampleRoom)
    await uploadPlan(project, file)
    await sendCommand(project, "소파를 옮겨줘")

    expect(vi.mocked(request).mock.calls.map(([config]) => config.url)).toEqual(
      [
        "/projects/living-room-01",
        "/projects/living-room-01/layout",
        "/projects/living-room-01/room",
        "/projects/living-room-01/floor-plan",
        "/projects/living-room-01/layout/commands",
      ]
    )
    expect(vi.mocked(request).mock.calls[3][0].timeout).toBe(UPLOAD_TIMEOUT_MS)
    expect(vi.mocked(request).mock.calls[2][0].data).toEqual({
      room: sampleRoom,
      expectedRevision: 0,
    })
  })
})

describe("furniture catalog source", () => {
  it("loads the catalog the server registered in server mode", async () => {
    const item = {
      id: "bench-server",
      name: "서버 벤치",
      category: "의자",
      description: "서버에만 있는 벤치",
      price: 120000,
      width: 1.4,
      depth: 0.4,
      color: "#123456",
    }
    vi.mocked(request).mockResolvedValue({
      version: 1,
      unit: "m",
      dimensionKind: "example",
      priceKind: "example",
      currency: "KRW",
      sourceAssetCount: 1,
      items: [item],
    })
    const { fetchFurnitureCatalog } = await import("./project-api")

    await expect(fetchFurnitureCatalog()).resolves.toEqual([item])
    expect(request).toHaveBeenCalledWith({ url: "/furniture-catalog" })
  })

  it("rejects a malformed server catalog instead of guessing", async () => {
    vi.mocked(request).mockResolvedValue({ version: 2, items: [] })
    const { fetchFurnitureCatalog } = await import("./project-api")

    await expect(fetchFurnitureCatalog()).rejects.toThrow()
  })

  it("uses the bundled contract catalog without a server", async () => {
    vi.stubEnv("VITE_API_MODE", "local")
    const { fetchFurnitureCatalog } = await import("./project-api")
    const { catalog } = await import("./data")

    await expect(fetchFurnitureCatalog()).resolves.toEqual(catalog)
    expect(request).not.toHaveBeenCalled()
  })
})
