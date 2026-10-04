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
