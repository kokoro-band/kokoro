// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { sampleProject } from "./data"

afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
  localStorage.clear()
})

async function localApi() {
  vi.resetModules()
  vi.stubEnv("VITE_API_MODE", "local")
  return import("./project-api")
}

describe("local command review contract", () => {
  it("reviews a single deletion instead of adding another item", async () => {
    const api = await localApi()
    const project = structuredClone(sampleProject)
    const proposal = await api.sendCommand(project, "소파를 삭제해줘")
    expect(proposal.requiresConfirmation).toBe(true)
    expect(proposal.proposedCommands).toEqual([
      { type: "REMOVE", furnitureId: "sofa-01" },
    ])
    expect(proposal.project.furniture).toEqual(project.furniture)
    expect(localStorage.length).toBe(0)
    const saved = await api.confirmCommand(project, proposal.proposalId!)
    expect(saved.project.furniture.some((item) => item.id === "sofa-01")).toBe(
      false
    )
  })
  it("proposes clearing without changing furniture or browser storage", async () => {
    const api = await localApi()
    const project = structuredClone(sampleProject)
    const before = structuredClone(project)
    const response = await api.sendCommand(project, "가구를 전부 삭제해줘")
    expect(response.project).toEqual(before)
    expect(response).toMatchObject({
      requiresConfirmation: true,
      appliedActions: [],
      proposedCommands: [{ type: "CLEAR" }],
    })
    expect(project).toEqual(before)
    expect(localStorage.length).toBe(0)
  })
  it("asks which chair to move instead of selecting the first match", async () => {
    const api = await localApi()
    const one = api.makeFurniture("chair-shell", 1, 1)
    const two = api.makeFurniture("chair-shell", 2, 2)
    const project = { ...structuredClone(sampleProject), furniture: [one, two] }
    const response = await api.sendCommand(project, "의자를 창가로 옮겨줘")
    expect(response.project.furniture).toEqual([one, two])
    expect(response).toMatchObject({
      appliedActions: [],
      candidates: [
        { furnitureId: one.id, name: one.name },
        { furnitureId: two.id, name: two.name },
      ],
    })
  })
  it("confirms once and does not replace subsequent edits on repeated confirmation", async () => {
    const api = await localApi()
    const project = structuredClone(sampleProject)
    const proposal = await api.sendCommand(project, "방을 비워줘")
    const applied = await api.confirmCommand(project, proposal.proposalId!)
    expect(applied.project.furniture).toEqual([])
    const edited = {
      ...applied.project,
      furniture: [api.makeFurniture("chair-shell", 1, 1)],
    }
    const repeated = await api.confirmCommand(edited, proposal.proposalId!)
    expect(repeated.project).toEqual(edited)
    expect(repeated.appliedActions).toEqual([])
    const undone = { ...project, updatedAt: new Date().toISOString() }
    const afterUndo = await api.confirmCommand(undone, proposal.proposalId!)
    expect(afterUndo.project).toEqual(undone)
    expect(afterUndo.appliedActions).toEqual([])
    expect(api.readSavedProject().furniture).toEqual([])
  })
  it("rejects an expired proposal or a changed layout without applying it", async () => {
    const api = await localApi()
    const project = structuredClone(sampleProject)
    const proposal = await api.sendCommand(project, "방을 비워줘")
    await expect(
      api.confirmCommand({ ...project, furniture: [] }, proposal.proposalId!)
    ).rejects.toThrow("다시 요청")
    vi.useFakeTimers()
    vi.setSystemTime(Date.now() + 300_001)
    await expect(
      api.confirmCommand(project, proposal.proposalId!)
    ).rejects.toThrow("다시 요청")
    expect(project.furniture.length).toBeGreaterThan(0)
  })
  it("selects only the requested candidate and handles aliases consistently", async () => {
    const api = await localApi()
    const one = api.makeFurniture("plant-olive", 1, 1)
    const two = api.makeFurniture("plant-olive", 2, 2)
    const project = { ...structuredClone(sampleProject), furniture: [one, two] }
    const proposal = await api.sendCommand(project, "식물을 창가로 옮겨줘")
    expect(proposal.candidates).toHaveLength(2)
    const response = await api.sendCommand(
      project,
      "식물을 창가로 옮겨줘",
      undefined,
      two.id
    )
    expect(response.project.furniture[0]).toEqual(one)
    expect(response.project.furniture[1]).not.toEqual(two)
    await expect(
      api.sendCommand(project, "식물을 옮겨줘", undefined, "missing")
    ).rejects.toThrow("다시 요청")
  })
})

describe("local commands inside a focused room", () => {
  async function twoRooms() {
    const api = await localApi()
    const { buildRoomModel } = await import("./room-builder")
    const room = buildRoomModel({
      rooms: [
        { id: "a", name: "거실", x: 0, z: 0, width: 4.8, depth: 6.9 },
        { id: "b", name: "침실", x: 4.8, z: 0, width: 4.8, depth: 6.9 },
      ],
      wallHeight: 2.4,
    })
    const [a, b] = room.rooms
    const project = {
      ...structuredClone(sampleProject),
      dimensions: { width: 9.6, depth: 6.9, height: 2.4 },
      room,
      furniture: [] as ReturnType<typeof api.makeFurniture>[],
    }
    return { api, project, a: a.polygon, b: b.polygon }
  }

  it("replaces only the focused room's furniture with the minimalist preset", async () => {
    const { api, project, b } = await twoRooms()
    const sofa = api.makeFurniture("sofa-cloud", 2, 4)
    const plant = api.makeFurniture("plant-olive", 4, 6)
    const chair = api.makeFurniture("chair-shell", 7, 3)
    project.furniture = [sofa, plant, chair]
    const proposal = await api.sendCommand(project, "미니멀한 거실로 꾸며줘", b)
    expect(
      proposal.proposedCommands.filter((command) => command.type === "REMOVE")
    ).toEqual([{ type: "REMOVE", furnitureId: chair.id }])
    const applied = await api.confirmCommand(project, proposal.proposalId!)
    expect(applied.project.furniture).toEqual(
      expect.arrayContaining([sofa, plant])
    )
    expect(applied.project.furniture).toHaveLength(5)
    expect(
      applied.project.furniture.filter((item) => item.x > 4.8)
    ).toHaveLength(3)
  })

  it("does not take furniture from another room", async () => {
    const { api, project, b } = await twoRooms()
    const chair = api.makeFurniture("chair-shell", 3.5, 1.7)
    project.furniture = [chair]
    const response = await api.sendCommand(project, "창가에 의자를 옮겨줘", b)
    expect(response.project.furniture).toEqual([chair])
    expect(response.commands).toEqual([])
    expect(response.reply).toContain("이 방에서 의자를 찾지 못했어요")
  })

  it("chooses and removes only among the focused room's furniture", async () => {
    const { api, project, a, b } = await twoRooms()
    const other = api.makeFurniture("chair-shell", 2, 2)
    const one = api.makeFurniture("chair-shell", 6, 2)
    const two = api.makeFurniture("chair-shell", 8, 5)
    project.furniture = [other, one, two]
    const choice = await api.sendCommand(project, "의자를 옮겨줘", b)
    expect(choice.candidates.map((item) => item.furnitureId)).toEqual([
      one.id,
      two.id,
    ])
    const removal = await api.sendCommand(project, "의자를 삭제해줘", a)
    expect(removal.proposedCommands).toEqual([
      { type: "REMOVE", furnitureId: other.id },
    ])
  })

  it("empties only the focused room", async () => {
    const { api, project, b } = await twoRooms()
    const sofa = api.makeFurniture("sofa-cloud", 2, 4)
    const chair = api.makeFurniture("chair-shell", 7, 3)
    project.furniture = [sofa, chair]
    const proposal = await api.sendCommand(project, "방을 비워줘", b)
    expect(proposal.proposedCommands).toEqual([
      { type: "REMOVE", furnitureId: chair.id },
    ])
    const applied = await api.confirmCommand(project, proposal.proposalId!)
    expect(applied.project.furniture).toEqual([sofa])
  })
})

describe("local commands use the catalog placement rules", () => {
  async function withTinyRoom() {
    const api = await localApi()
    const { buildRoomModel } = await import("./room-builder")
    const { placementIssues } = await import("./placement-issues")
    const room = buildRoomModel({
      rooms: [
        { id: "a", name: "거실", x: 0, z: 0, width: 9.4, depth: 6.9 },
        { id: "b", name: "창고", x: 9.4, z: 0, width: 1, depth: 1 },
      ],
      wallHeight: 2.4,
    })
    const project = {
      ...structuredClone(sampleProject),
      dimensions: { width: 10.4, depth: 6.9, height: 2.4 },
      room,
      furniture: [] as ReturnType<typeof api.makeFurniture>[],
    }
    return { api, project, room, placementIssues }
  }

  it("refuses furniture that cannot fit the focused room", async () => {
    const { api, project, room } = await withTinyRoom()
    const response = await api.sendCommand(
      project,
      "소파를 놓아줘",
      room.rooms[1].polygon
    )
    expect(response.project.furniture).toEqual([])
    expect(response.commands).toEqual([])
    expect(response.reply).toContain("소파를 놓을 자리가 없어요")
  })

  it("adds furniture without overlapping walls, doors or other furniture", async () => {
    const { api, project, room, placementIssues } = await withTinyRoom()
    const focus = room.rooms[0].polygon
    project.furniture = [api.makeFurniture("chair-shell", 6.8, 1.7)]
    const response = await api.sendCommand(project, "의자를 놓아줘", focus)
    expect(response.project.furniture).toHaveLength(2)
    expect(placementIssues(response.project)).toEqual([])
  })
})

describe("local commands placed beside existing furniture", () => {
  async function livingRoom() {
    const api = await localApi()
    const { buildRoomModel } = await import("./room-builder")
    const { placementIssues } = await import("./placement-issues")
    const room = buildRoomModel({
      rooms: [{ id: "a", name: "거실", x: 0, z: 0, width: 6, depth: 5 }],
      wallHeight: 2.4,
    })
    const project = {
      ...structuredClone(sampleProject),
      dimensions: { width: 6, depth: 5, height: 2.4 },
      room,
      furniture: [] as ReturnType<typeof api.makeFurniture>[],
    }
    return { api, project, focus: room.rooms[0].polygon, placementIssues }
  }

  it("adds only the plant next to the existing sofa", async () => {
    const { api, project, focus, placementIssues } = await livingRoom()
    const sofa = api.makeFurniture("sofa-cloud", 2, 2.5)
    const chair = api.makeFurniture("chair-shell", 4.5, 1)
    project.furniture = [sofa, chair]
    const response = await api.sendCommand(
      project,
      "소파 옆에 화분을 놓아줘",
      focus
    )
    const added = response.project.furniture.slice(2)
    expect(added.map((item) => item.catalogId)).toEqual(["plant-olive"])
    expect(Math.hypot(added[0].x - sofa.x, added[0].z - sofa.z)).toBeLessThan(
      1.8
    )
    expect(placementIssues(response.project)).toEqual([])
    expect(response.reply).not.toContain("소파를 놓았어요")
  })

  it("explains instead of adding the reference furniture when it is missing", async () => {
    const { api, project, focus } = await livingRoom()
    const response = await api.sendCommand(
      project,
      "소파 옆에 화분을 놓아줘",
      focus
    )
    expect(response.project.furniture).toEqual([])
    expect(response.reply).toContain("기준이 될 소파")
  })
})
