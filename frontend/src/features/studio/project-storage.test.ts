import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { sampleProject } from "./data"
import { readSavedProject, saveProject } from "./project-api"

const key = "kokoro-remodel-project-v1"
const values = new Map<string, string>()
const setItem = vi.fn((key: string, value: string) => values.set(key, value))
const removeItem = vi.fn((key: string) => values.delete(key))
beforeEach(() => {
  values.clear()
  vi.clearAllMocks()
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem,
    removeItem,
  })
})
afterEach(() => vi.unstubAllGlobals())

function project() {
  return { ...structuredClone(sampleProject), id: "my-saved-project", name: "내 작업" }
}

describe("local project read boundary", () => {
  it("restores a valid project including repairable out-of-room furniture and old catalog IDs", () => {
    const saved = project()
    saved.furniture[0] = { ...saved.furniture[0], catalogId: "old-sofa", x: 30, z: -5 }
    values.set(key, JSON.stringify(saved))
    expect(readSavedProject()).toEqual(saved)
    expect(setItem).not.toHaveBeenCalled()
    expect(removeItem).not.toHaveBeenCalled()
  })
  it("accepts new projects with no room and no furniture", () => {
    const saved = { ...project(), room: undefined, furniture: [], floorPlan: { fileName: "", size: 0, status: "EMPTY", progress: 0, uploadedAt: null } }
    values.set(key, JSON.stringify(saved))
    expect(readSavedProject().id).toBe(saved.id)
  })
  it.each([
    ["null furniture", (p: Record<string, any>) => { p.furniture = [null] }],
    ["non-finite coordinate", (p: Record<string, any>) => { p.furniture[0].x = null }],
    ["string coordinate", (p: Record<string, any>) => { p.furniture[0].z = "3" }],
    ["duplicate furniture", (p: Record<string, any>) => { p.furniture.push(p.furniture[0]) }],
    ["empty dimensions", (p: Record<string, any>) => { p.dimensions = {} }],
    ["missing floor plan", (p: Record<string, any>) => { delete p.floorPlan }],
    ["unknown status", (p: Record<string, any>) => { p.floorPlan.status = "SUCCESS" }],
    ["non-array walls", (p: Record<string, any>) => { p.room.walls = "walls" }],
    ["bad polygon point", (p: Record<string, any>) => { p.room.rooms[0].polygon = [[null, 0], [1, 0], [1, 1]] }],
    ["missing wall reference", (p: Record<string, any>) => { p.room.openings[0].wallId = "missing" }],
    ["duplicate opening", (p: Record<string, any>) => { p.room.openings.push(p.room.openings[0]) }],
    ["wrong version", (p: Record<string, any>) => { p.room.version = 99 }],
    ["huge furniture array", (p: Record<string, any>) => { p.furniture = Array.from({length:201}, (_,i) => ({...p.furniture[0],id:`f-${i}`})) }],
    ["huge wall array", (p: Record<string, any>) => { p.room.walls = Array.from({length:1025}, (_,i) => ({...p.room.walls[0],id:`w-${i}`})) }],
    ["oversized project name", (p: Record<string, any>) => { p.name = "가".repeat(81) }],
  ])("rejects %s without touching the saved original", (_, corrupt) => {
    const saved = project()
    corrupt(saved)
    const raw = JSON.stringify(saved)
    values.set(key, raw)
    expect(readSavedProject().id).toBe(sampleProject.id)
    expect(values.get(key)).toBe(raw)
    expect(setItem).not.toHaveBeenCalled()
    expect(removeItem).not.toHaveBeenCalled()
  })
  it.each(["", "null", "{", "[]"])("preserves unparsable or non-project raw value %j", (raw) => {
    values.set(key, raw)
    expect(readSavedProject().id).toBe(sampleProject.id)
    expect(values.get(key)).toBe(raw)
    expect(setItem).not.toHaveBeenCalled()
    expect(removeItem).not.toHaveBeenCalled()
  })
  it("does not persist a local draft that the reader would reject", async () => {
    const saved = project()
    saved.name = "가".repeat(81)
    await expect(saveProject(saved)).rejects.toThrow()
    expect(setItem).not.toHaveBeenCalled()
  })
})
