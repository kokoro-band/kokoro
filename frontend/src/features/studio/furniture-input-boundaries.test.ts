import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import fixtures from "../../../../docs/contracts/fixtures/furniture-input-boundaries.json"
import { request } from "@/lib/http-client"
import { sampleProject } from "./data"
import { parseStoredProject } from "./project-validation"
import type { Project } from "./types"

vi.mock("@/lib/http-client", () => ({
  request: vi.fn(),
  UPLOAD_TIMEOUT_MS: 60_000,
}))
const setItem = vi.fn()
const getItem = vi.fn()
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.stubGlobal("localStorage", { setItem, getItem })
  vi.mocked(request).mockResolvedValue({ ...sampleProject, revision: 0 })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const cases = [
  ...fixtures.strings.map((f) => ({ ...f, value: f.unit.repeat(f.repeat) })),
  ...fixtures.numbers,
]

describe.each(["local", "server"])("%s furniture write boundary", (mode) => {
  it.each(cases)("$id", async ({ field, value, accepted }) => {
    vi.stubEnv("VITE_API_MODE", mode)
    const { saveProject } = await import("./project-api")
    const project = {
      ...structuredClone(sampleProject),
      ...(mode === "server" ? { revision: 0 } : {}),
    }
    project.furniture = [{ ...project.furniture[0], [field]: value }]
    const before = structuredClone(project)
    if (accepted) await expect(saveProject(project)).resolves.toBeDefined()
    else {
      await expect(saveProject(project)).rejects.toThrow()
      expect(request).not.toHaveBeenCalled()
      expect(setItem).not.toHaveBeenCalled()
    }
    expect(project).toEqual(before)
  })

  it.each([null, [null]])(
    "rejects malformed list %j before side effects",
    async (furniture) => {
      vi.stubEnv("VITE_API_MODE", mode)
      const { saveProject } = await import("./project-api")
      const project = { ...sampleProject, furniture } as unknown as Project
      await expect(saveProject(project)).rejects.toThrow()
      expect(request).not.toHaveBeenCalled()
      expect(setItem).not.toHaveBeenCalled()
    }
  )
})

it.each(fixtures.dimensions)(
  "stored dimension $field $value",
  ({ field, value, accepted }) => {
    const project = {
      ...sampleProject,
      dimensions: { ...sampleProject.dimensions, [field]: value },
    }
    if (accepted)
      expect(parseStoredProject(project).dimensions).toEqual(project.dimensions)
    else expect(() => parseStoredProject(project)).toThrow()
  }
)

it("keeps legacy long furniture readable and preserves the original when a new save fails", async () => {
  vi.stubEnv("VITE_API_MODE", "local")
  const project = structuredClone(sampleProject)
  project.furniture[0].id = "a".repeat(128)
  project.furniture[0].name = "가".repeat(256)
  project.furniture[0].color = "a".repeat(64)
  const raw = JSON.stringify(project)
  getItem.mockReturnValue(raw)
  const { readSavedProjectWithRecovery, saveProject } =
    await import("./project-api")
  const restored = readSavedProjectWithRecovery()
  expect(restored).toEqual({ project, recovery: null })
  await expect(saveProject(project)).rejects.toThrow()
  expect(setItem).not.toHaveBeenCalled()
  expect(getItem()).toBe(raw)
})
