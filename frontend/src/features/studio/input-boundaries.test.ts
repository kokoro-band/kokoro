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
  vi.mocked(request).mockImplementation(async (config) =>
    config.url?.endsWith("/commands")
      ? { project: { ...sampleProject, revision: 0 } }
      : { ...sampleProject, revision: 0 }
  )
  vi.stubGlobal("localStorage", { setItem })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("input boundaries", () => {
  it.each(fixtures.strings.filter(({ field }) => field !== "roomType"))(
    "$id",
    async (fixture) => {
      vi.stubEnv("VITE_API_MODE", "local")
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
        expect(setItem).not.toHaveBeenCalled()
      }
    }
  )

  it.each(fixtures.furniture)(
    "furniture count $count",
    async ({ count, accepted }) => {
      vi.stubEnv("VITE_API_MODE", "local")
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
        expect(setItem).not.toHaveBeenCalled()
      }
      expect(project).toEqual(snapshot)
    }
  )

  it("blocks invalid name, command, and furniture count before calling the server API", async () => {
    vi.stubEnv("VITE_API_MODE", "server")
    const { createProject, saveProject, sendCommand } =
      await import("./project-api")
    const project = { ...structuredClone(sampleProject), revision: 0 }
    await expect(createProject("가".repeat(81))).rejects.toThrow("이름")
    await expect(sendCommand(project, "가".repeat(1001))).rejects.toThrow(
      "요청"
    )
    await expect(
      saveProject({
        ...project,
        furniture: Array.from({ length: 201 }, (_, index) => ({
          ...project.furniture[0],
          id: `item-${index}`,
        })),
      })
    ).rejects.toThrow("200")
    expect(request).not.toHaveBeenCalled()
  })
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
