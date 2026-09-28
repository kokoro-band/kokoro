import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { request } from "@/lib/http-client"
import { sampleProject } from "./data"
import { sampleRoom } from "./sample-room"

vi.mock("@/lib/http-client", () => ({
  request: vi.fn(),
  UPLOAD_TIMEOUT_MS: 60_000,
}))
const base = { ...structuredClone(sampleProject), revision: 7 }
const reply = {
  project: base,
  reply: "ok",
  commands: [],
  appliedActions: [],
  requiresConfirmation: false,
}
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.stubEnv("VITE_API_MODE", "server")
  vi.mocked(request).mockResolvedValue(base)
})
afterEach(() => vi.unstubAllEnvs())

describe("server revision contract", () => {
  it("rejects an older write response before controller callbacks can apply it", async () => {
    const api = await import("./project-api")
    vi.mocked(request).mockResolvedValue({ ...base, revision: 6 })
    await expect(api.saveProject(base)).rejects.toThrow("버전")
    await expect(api.saveRoom(base, sampleRoom)).rejects.toThrow("버전")
    await expect(
      api.uploadPlan(base, new File(["pdf"], "plan.pdf"))
    ).rejects.toThrow("버전")
    vi.mocked(request).mockResolvedValue({
      ...reply,
      project: { ...base, revision: 6 },
    })
    await expect(api.sendCommand(base, "의자 이동")).rejects.toThrow("버전")
    await expect(api.confirmCommand(base, "proposal")).rejects.toThrow("버전")
  })
  it("sends the provided revision for layout, room and command", async () => {
    const api = await import("./project-api")
    await api.saveProject(base)
    await api.saveRoom(base, sampleRoom)
    vi.mocked(request).mockResolvedValue(reply)
    await api.sendCommand(base, "의자를 이동해줘")
    expect(
      vi.mocked(request).mock.calls.map(([config]) => config.data)
    ).toEqual([
      { furniture: base.furniture, expectedRevision: 7 },
      { room: sampleRoom, expectedRevision: 7 },
      { message: "의자를 이동해줘", expectedRevision: 7 },
    ])
  })

  it.each([undefined, null, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "7"])(
    "refuses writes without a valid base revision: %s",
    async (revision) => {
      const api = await import("./project-api")
      const project = { ...base, revision } as unknown as typeof base
      await expect(api.saveProject(project)).rejects.toThrow("버전")
      await expect(api.saveRoom(project, sampleRoom)).rejects.toThrow("버전")
      await expect(api.sendCommand(project, "의자를 이동해줘")).rejects.toThrow(
        "버전"
      )
      expect(request).not.toHaveBeenCalled()
    }
  )

  it.each([undefined, null, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "7"])(
    "rejects an invalid revision from every server response: %s",
    async (revision) => {
      const api = await import("./project-api")
      vi.mocked(request).mockResolvedValue({ ...base, revision })
      await expect(api.getProject(base.id)).rejects.toThrow("버전")
      await expect(api.saveProject(base)).rejects.toThrow("버전")
      await expect(api.saveRoom(base, sampleRoom)).rejects.toThrow("버전")
      await expect(api.createProject("우리 집")).rejects.toThrow("버전")
      await expect(
        api.uploadPlan(base, new File(["pdf"], "plan.pdf"))
      ).rejects.toThrow("버전")
      vi.mocked(request).mockResolvedValue({
        ...reply,
        project: { ...base, revision },
      })
      await expect(api.sendCommand(base, "의자를 이동해줘")).rejects.toThrow(
        "버전"
      )
      await expect(api.confirmCommand(base, "proposal")).rejects.toThrow("버전")
    }
  )

  it("rejects another project's snapshot instead of associating its revision with this project", async () => {
    const api = await import("./project-api")
    vi.mocked(request).mockResolvedValue({ ...base, id: "other" })
    await expect(api.getProject(base.id)).rejects.toThrow("프로젝트")
    await expect(api.saveProject(base)).rejects.toThrow("프로젝트")
  })

  it("retains zero revision and accepts confirm retries without a current version token", async () => {
    const api = await import("./project-api")
    vi.mocked(request).mockResolvedValue({ ...base, revision: 0 })
    expect(await api.getProject(base.id)).toMatchObject({ revision: 0 })
    vi.mocked(request).mockResolvedValue(reply)
    await api.confirmCommand(sampleProject, "proposal")
    expect(request).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { proposalId: "proposal" } })
    )
  })
})
