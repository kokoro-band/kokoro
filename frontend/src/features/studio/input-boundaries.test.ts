import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"

import fixtures from "../../../../docs/contracts/fixtures/input-boundaries.json"
import { request } from "@/lib/http-client"
import { sampleProject } from "./data"
import { parseStoredProject } from "./project-validation"

vi.mock("@/lib/http-client", () => ({
  request: vi.fn(),
  UPLOAD_TIMEOUT_MS: 60_000,
}))

const setItem = vi.fn()

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.mocked(request).mockResolvedValue(sampleProject)
  vi.stubGlobal("localStorage", { setItem })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe.each(["server", "local"])("%s input boundaries", (mode) => {
  it.each(fixtures.strings.filter(({ field }) => field !== "roomType"))(
    "$id",
    async (fixture) => {
      vi.stubEnv("VITE_API_MODE", mode)
      const { createProject, sendCommand } = await import("./project-api")
      const value = (fixture.prefix ?? "") + fixture.unit.repeat(fixture.repeat)
      const action =
        fixture.field === "name"
          ? createProject(value)
          : sendCommand(structuredClone(sampleProject), value)
      if (fixture.client) await expect(action).resolves.toBeDefined()
      else {
        await expect(action).rejects.toThrow(
          fixture.field === "name" ? "이름" : "요청"
        )
        expect(request).not.toHaveBeenCalled()
        expect(setItem).not.toHaveBeenCalled()
      }
    }
  )

  it.each(fixtures.furniture)(
    "furniture count $count",
    async ({ count, accepted }) => {
      vi.stubEnv("VITE_API_MODE", mode)
      const { saveProject } = await import("./project-api")
      const project = {
        ...sampleProject,
        furniture: Array.from({ length: count }, (_, index) => ({
          ...sampleProject.furniture[0],
          id: `item-${index}`,
        })),
      }
      const snapshot = structuredClone(project)
      if (accepted) await expect(saveProject(project)).resolves.toBeDefined()
      else {
        await expect(saveProject(project)).rejects.toThrow("200")
        expect(request).not.toHaveBeenCalled()
        expect(setItem).not.toHaveBeenCalled()
      }
      expect(project).toEqual(snapshot)
    }
  )
})

it.each(fixtures.strings.filter(({ field }) => field !== "message"))(
  "stored project $id",
  (fixture) => {
    const value = (fixture.prefix ?? "") + fixture.unit.repeat(fixture.repeat)
    const parse = () =>
      parseStoredProject({ ...sampleProject, [fixture.field]: value })
    if (fixture.client)
      expect(parse()).toMatchObject({ [fixture.field]: value })
    else expect(parse).toThrow()
  }
)

it("rejects a local command that would add furniture 201 without mutating the source", async () => {
  vi.stubEnv("VITE_API_MODE", "local")
  const { sendCommand } = await import("./project-api")
  const project = {
    ...sampleProject,
    furniture: Array.from({ length: 200 }, (_, index) => ({
      ...sampleProject.furniture[2],
      id: `item-${index}`,
    })),
  }
  const before = structuredClone(project)
  await expect(sendCommand(project, "소파를 놓아줘")).rejects.toThrow("200")
  expect(project).toEqual(before)
  expect(setItem).not.toHaveBeenCalled()
})
