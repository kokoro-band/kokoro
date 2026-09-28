import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import fixture from "../../../../docs/contracts/fixtures/furniture-rotation.json"
import { request } from "@/lib/http-client"
import { sampleProject } from "./data"
import { constrainFurniturePose } from "./furniture-motion"
import { footprint, insideRoom, overlaps, wallBox } from "./placement-issues"
import { parseStoredProject } from "./project-validation"
import type { Furniture, Project, RoomModel } from "./types"

vi.mock("@/lib/http-client", () => ({ request: vi.fn(), UPLOAD_TIMEOUT_MS: 60_000 }))
let saved: string | null = null
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  saved = null
  vi.stubGlobal("localStorage", {
    getItem: () => saved,
    setItem: (_key: string, value: string) => { saved = value },
  })
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

function project(rotation: number): Project {
  return {
    ...structuredClone(sampleProject),
    dimensions: { width: 6, depth: 6, height: 2.4 },
    room: fixture.motion.room as RoomModel,
    furniture: [{ ...fixture.motion.item, rotation } as Furniture],
  }
}

describe("fractional rotation persistence", () => {
  it.each(fixture.accepted)("keeps %s degrees in local restore and server payload", async (rotation) => {
    vi.stubEnv("VITE_API_MODE", "local")
    const local = await import("./project-api")
    const source = project(rotation)
    await local.saveProject(source)
    const restored = local.readSavedProject()
    expect(restored.furniture[0].rotation).toBe(rotation)
    expect(parseStoredProject(JSON.parse(saved!)).furniture[0].rotation).toBe(rotation)

    vi.resetModules()
    vi.stubEnv("VITE_API_MODE", "server")
    vi.mocked(request).mockResolvedValue(restored)
    const server = await import("./project-api")
    await server.saveProject(restored)
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      method: "PUT", data: { furniture: restored.furniture },
    }))
    expect(restored.furniture[0].rotation).toBe(rotation)
  })

  it("keeps the fractional angle produced by a real wall-limited turn", async () => {
    const source = project(0)
    const rotated = constrainFurniturePose(source, source.furniture[0], { rotation: fixture.motion.requestedRotation })
    expect(rotated.rotation).toBe(fixture.motion.resultRotation)
    const box = footprint(rotated)!
    expect(insideRoom(source.room!.outline, box)).toBe(true)
    expect(source.room!.walls.some((wall) => overlaps(box, wallBox(wall)))).toBe(false)
    vi.stubEnv("VITE_API_MODE", "local")
    const { saveProject, readSavedProject } = await import("./project-api")
    await saveProject({ ...source, furniture: [rotated] })
    expect(readSavedProject().furniture[0]).toEqual(rotated)
  })
})
