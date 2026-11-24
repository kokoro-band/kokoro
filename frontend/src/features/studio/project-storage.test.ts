import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { sampleProject } from "./data"
import {
  createProject,
  readSavedProjectWithRecovery,
  saveProject,
  saveRoom,
} from "./project-api"
import {
  maxStoredProjectLength,
  parseStoredProject,
} from "./project-validation"
import { roomForFurniture } from "./house-navigation"
import { placementIssues } from "./placement-issues"
import { buildRoomModel, createDraft } from "./room-builder"

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
  return {
    ...structuredClone(sampleProject),
    id: "my-saved-project",
    name: "내 작업",
  }
}
function replaceField(source: unknown, path: string, value: unknown) {
  const parts = path.split(".")
  let target = source as Record<string, unknown>
  for (const part of parts.slice(0, -1))
    target = target[part] as Record<string, unknown>
  target[parts.at(-1)!] = value
}
function repeated<T extends object>(value: T, count: number) {
  return Array.from({ length: count }, (_, index) => ({
    ...value,
    id: `entry-${index}`,
  }))
}

describe("local project read boundary", () => {
  it("furnishes the first-visit demo by room without adding demo pieces to a user's project", async () => {
    const demo = readSavedProjectWithRecovery().project
    const rooms = demo.room!.rooms
    const byRoom = (name: string) =>
      demo.furniture
        .filter((piece) => rooms[roomForFurniture(rooms, piece)]?.name === name)
        .map((piece) => piece.catalogId)
    expect(byRoom("안방")).toContain("bed-linen")
    expect(byRoom("주방 · 식당")).toEqual(
      expect.arrayContaining(["table-dining", "chair-bench"])
    )
    expect(byRoom("방1")).toContain("storage-open")
    expect(placementIssues(demo)).toEqual([])
    const previous = { ...demo, furniture: demo.furniture.slice(0, 4) }
    values.set(key, JSON.stringify(previous))
    expect(readSavedProjectWithRecovery().project.furniture).toEqual(
      previous.furniture
    )
    expect((await createProject("빈 프로젝트")).furniture).toEqual([])
  })

  it("restores a valid project including repairable out-of-room furniture and old catalog IDs", () => {
    const saved = project()
    saved.furniture[0] = {
      ...saved.furniture[0],
      catalogId: "old-sofa",
      x: 30,
      z: -5,
    }
    values.set(key, JSON.stringify(saved))
    expect(readSavedProjectWithRecovery().project).toEqual(saved)
    expect(setItem).not.toHaveBeenCalled()
    expect(removeItem).not.toHaveBeenCalled()
  })
  it.each([
    ["bed-linen", "침대"],
    ["storage-open", "수납"],
  ] as const)(
    "saves and reopens a placed %s without changing its transform",
    async (catalogId, category) => {
      const saved = project()
      saved.furniture.push({
        ...saved.furniture[0],
        id: "added-furniture",
        catalogId,
        category,
        x: 3.4,
        z: 4.2,
        rotation: 90,
      })
      await saveProject(saved)
      expect(readSavedProjectWithRecovery().project.furniture).toEqual(
        saved.furniture
      )
    }
  )

  it("accepts new projects with no room and no furniture", () => {
    const saved = {
      ...project(),
      room: undefined,
      furniture: [],
      floorPlan: {
        fileName: "",
        size: 0,
        status: "EMPTY",
        progress: 0,
        uploadedAt: null,
      },
    }
    values.set(key, JSON.stringify(saved))
    expect(readSavedProjectWithRecovery().project.id).toBe(saved.id)
  })
  it("preserves Unicode names accepted by the new-project dialog", async () => {
    const saved = { ...project(), name: "😀".repeat(60) }
    await expect(saveProject(saved)).resolves.toMatchObject({
      name: saved.name,
    })
    expect(readSavedProjectWithRecovery().project.name).toBe(saved.name)
  })
  it.each<[string, unknown]>([
    ["furniture", [null]],
    ["furniture.0.x", null],
    ["furniture.0.z", "3"],
    ["furniture.0.category", "전체"],
    ["furniture.0.id", "__proto__"],
    ["furniture", [sampleProject.furniture[0], sampleProject.furniture[0]]],
    ["dimensions", {}],
    ["dimensions.width", 0],
    ["floorPlan", undefined],
    ["floorPlan.status", "SUCCESS"],
    ["floorPlan.progress", 101],
    ["floorPlan.size", -1],
    ["floorPlan.fileName", "x".repeat(256)],
    ["updatedAt", "invalid date"],
    ["id", "../project"],
    ["room.walls", "walls"],
    ["room.walls.0.b", sampleProject.room!.walls[0].a],
    [
      "room.rooms.0.polygon",
      [
        [null, 0],
        [1, 0],
        [1, 1],
      ],
    ],
    [
      "room.outline",
      [
        [0, 0],
        [1, 1],
        [2, 2],
      ],
    ],
    ["room.openings.0.wallId", "missing"],
    ["room.openings.0.to", 500],
    [
      "room.openings",
      [sampleProject.room!.openings[0], sampleProject.room!.openings[0]],
    ],
    ["room.version", 99],
    ["room.spawn", [1, 2, 3]],
    ["room.source", { areaPyeong: 20, roomCount: 1.5, preset: "blocks-v1" }],
    ["furniture", repeated(sampleProject.furniture[0], 201)],
    ["room.walls", repeated(sampleProject.room!.walls[0], 1025)],
    ["room.openings", repeated(sampleProject.room!.openings[0], 1025)],
    ["room.rooms", repeated(sampleProject.room!.rooms[0], 129)],
    [
      "room.outline",
      Array.from({ length: 513 }, (_, i) => [5 + Math.cos(i), 3 + Math.sin(i)]),
    ],
    ["name", "가".repeat(81)],
  ])(
    "rejects invalid %s without touching the saved original",
    (path, value) => {
      const saved = project()
      replaceField(saved, path, value)
      const raw = JSON.stringify(saved)
      values.set(key, raw)
      expect(readSavedProjectWithRecovery().recovery).toBe("corrupt")
      expect(readSavedProjectWithRecovery().project.id).toBe(sampleProject.id)
      expect(values.get(key)).toBe(raw)
      expect(setItem).not.toHaveBeenCalled()
      expect(removeItem).not.toHaveBeenCalled()
    }
  )
  it.each(["", "null", "{", "[]"])(
    "preserves malformed raw value %j",
    (raw) => {
      values.set(key, raw)
      expect(readSavedProjectWithRecovery().recovery).toBe("corrupt")
      expect(values.get(key)).toBe(raw)
      expect(setItem).not.toHaveBeenCalled()
      expect(removeItem).not.toHaveBeenCalled()
    }
  )
  it("caps raw size before JSON parsing", () => {
    const raw = " ".repeat(maxStoredProjectLength + 1)
    values.set(key, raw)
    const parse = vi.spyOn(JSON, "parse")
    try {
      expect(readSavedProjectWithRecovery().recovery).toBe("corrupt")
      expect(parse).not.toHaveBeenCalled()
      expect(values.get(key)).toBe(raw)
    } finally {
      parse.mockRestore()
    }
  })
  it.each([NaN, Infinity, -Infinity])(
    "rejects non-finite in-memory numeric value %s before serialization",
    (value) => {
      const saved = project()
      saved.furniture[0].x = value
      expect(() => parseStoredProject(saved)).toThrow()
    }
  )
  it("normalizes nullable optional fields without mutating the original", () => {
    const saved = {
      ...project(),
      room: { ...sampleProject.room!, rooms: null, source: null, spawn: null },
    }
    const loaded = parseStoredProject(saved)
    expect(loaded.room!.rooms).toEqual([])
    expect(loaded.room!.spawn).toBeUndefined()
    expect(loaded.room!.source).toBeUndefined()
    expect(saved.room.rooms).toBeNull()
    expect(parseStoredProject({ ...saved, room: null }).room).toBeUndefined()
  })
  it("caps total room polygon points at 4096", () => {
    const saved = project()
    const points = Array.from({ length: 512 }, (_, i): [number, number] => [
      5 + Math.cos((i * 2 * Math.PI) / 512),
      3 + Math.sin((i * 2 * Math.PI) / 512),
    ])
    saved.room!.rooms = Array.from({ length: 8 }, () => ({
      name: "방",
      polygon: points,
    }))
    expect(parseStoredProject(saved).room!.rooms).toHaveLength(8)
    saved.room!.rooms.push(sampleProject.room!.rooms[0])
    expect(() => parseStoredProject(saved)).toThrow()
  })
  it("round-trips actual generated room structures through local persistence", async () => {
    for (const area of [3, 20, 100]) {
      const room = buildRoomModel(createDraft(area))
      await saveRoom(project(), room)
      expect(readSavedProjectWithRecovery().project.room).toEqual(room)
    }
  })
  it("does not persist a local draft that the reader would reject", async () => {
    const saved = project()
    saved.name = "가".repeat(81)
    await expect(saveProject(saved)).rejects.toThrow()
    expect(setItem).not.toHaveBeenCalled()
  })
})
