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
  it("proposes clearing without changing furniture or browser storage", async () => {
    const api = await localApi()
    const project = structuredClone(sampleProject)
    const before = structuredClone(project)
    const response = await api.sendCommand(project, "가구를 전부 삭제해줘")
    expect(response.project).toEqual(before)
    expect(response).toMatchObject({ requiresConfirmation: true, appliedActions: [], proposedCommands: [{ type: "CLEAR" }] })
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
    expect(response).toMatchObject({ appliedActions: [], candidates: [{ furnitureId: one.id, name: one.name }, { furnitureId: two.id, name: two.name }] })
  })
})
