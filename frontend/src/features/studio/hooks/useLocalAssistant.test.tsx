// @vitest-environment happy-dom
import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { ApiError } from "@/lib/http-client"
import { sampleProject } from "../data"
import { useLocalAssistant } from "./useLocalAssistant"
import type { LayoutProposal } from "../layout-proposals"

const api = vi.hoisted(() => ({
  getProject: vi.fn(),
  check: vi.fn(),
  interpret: vi.fn(),
  catalog: vi.fn(),
  preview: vi.fn(),
  status: vi.fn(),
  act: vi.fn(),
  choice: vi.fn(),
}))
vi.mock("../project-api", () => ({ getProject: api.getProject }))
vi.mock("../local-ai", () => ({
  checkLocalModel: api.check,
  interpretLocally: api.interpret,
}))
vi.mock("../layout-proposals", () => ({
  getServerCatalog: api.catalog,
  previewIntent: api.preview,
  proposalStatus: api.status,
  actOnProposal: api.act,
  readLayoutChoice: api.choice,
}))

const project = { ...sampleProject, revision: 3, furniture: [] }
const intent = {
  reply: "의자 추가",
  clarification: null,
  commands: [{ action: "ADD" }],
}
const proposal: LayoutProposal = {
  id: "proposal-one",
  status: "PENDING",
  baseRevision: 3,
  expiresAt: "2030-01-01T00:00:00Z",
  proposedFurniture: [],
  actions: ["의자 추가"],
  result: null,
}
function setup(enabled = true) {
  const prepare = vi.fn().mockResolvedValue(project)
  const release = vi.fn(),
    applied = vi.fn(),
    message = vi.fn()
  return {
    ...renderHook(() =>
      useLocalAssistant({ enabled, prepare, release, applied, message })
    ),
    prepare,
    release,
    applied,
    message,
  }
}
beforeEach(() => {
  vi.resetAllMocks()
  sessionStorage.clear()
  api.catalog.mockResolvedValue([])
  api.check.mockResolvedValue("qwen3:4b")
  api.interpret.mockResolvedValue(intent)
  api.preview.mockResolvedValue(proposal)
  api.choice.mockReturnValue(null)
  api.getProject.mockResolvedValue({ ...project, revision: 4 })
})
afterEach(cleanup)

describe("local assistant confirmation lifecycle", () => {
  it("does not apply a preview and only unlocks after confirmation and latest project fetch", async () => {
    const hook = setup()
    await act(() => hook.result.current.send("의자 추가", null))
    expect(hook.result.current.phase).toBe("preview")
    expect(hook.applied).not.toHaveBeenCalled()
    expect(hook.release).not.toHaveBeenCalled()
    api.act.mockResolvedValue({
      ...proposal,
      status: "APPLIED",
      result: { ...project, revision: 4 },
    })
    await act(() => hook.result.current.act("confirm"))
    expect(hook.applied).toHaveBeenCalledWith({ ...project, revision: 4 })
    expect(hook.result.current.locked).toBe(false)
    expect(sessionStorage.getItem("kokoro-pending-local-proposal")).toBeNull()
  })

  it("keeps editing locked after a lost confirmation response and recovers without resending", async () => {
    const hook = setup()
    await act(() => hook.result.current.send("의자 추가", null))
    api.act.mockRejectedValue(new Error("network"))
    await act(() => hook.result.current.act("confirm"))
    expect(hook.result.current.phase).toBe("recover")
    expect(hook.result.current.locked).toBe(true)
    expect(hook.release).not.toHaveBeenCalled()
    api.status.mockResolvedValue({
      ...proposal,
      status: "APPLIED",
      result: project,
    })
    await act(() => hook.result.current.act("recover"))
    expect(api.act).toHaveBeenCalledTimes(1)
    expect(hook.applied).toHaveBeenCalledWith({ ...project, revision: 4 })
  })

  it("restores a pending confirmation after reload and does not apply it automatically", async () => {
    sessionStorage.setItem(
      "kokoro-pending-local-proposal",
      JSON.stringify({ projectId: project.id, proposalId: proposal.id })
    )
    const hook = setup()
    expect(hook.result.current.phase).toBe("recover")
    api.status.mockResolvedValue(proposal)
    api.getProject.mockResolvedValue(project)
    await act(() => hook.result.current.act("recover"))
    expect(hook.result.current.phase).toBe("preview")
    expect(hook.result.current.locked).toBe(true)
    expect(api.act).not.toHaveBeenCalled()
    expect(hook.release).not.toHaveBeenCalled()
    expect(hook.applied).toHaveBeenCalledWith(project)
    expect(hook.result.current.proposalProjectId).toBe(project.id)
  })

  it("restores the proposal's own project before showing its preview", async () => {
    const original = {
      ...project,
      id: "original-project",
      dimensions: { width: 12, depth: 8, height: 3 },
    }
    sessionStorage.setItem(
      "kokoro-pending-local-proposal",
      JSON.stringify({ projectId: original.id, proposalId: proposal.id })
    )
    const hook = setup()
    api.status.mockResolvedValue(proposal)
    api.getProject.mockResolvedValue(original)
    await act(() => hook.result.current.act("recover"))
    expect(api.getProject).toHaveBeenCalledWith(original.id)
    expect(hook.applied).toHaveBeenCalledWith(original)
    expect(hook.result.current.proposalProjectId).toBe(original.id)
    expect(hook.result.current.phase).toBe("preview")
    expect(api.act).not.toHaveBeenCalled()
  })

  it("does not preview if the project changes between reading status and loading the project", async () => {
    sessionStorage.setItem(
      "kokoro-pending-local-proposal",
      JSON.stringify({ projectId: project.id, proposalId: proposal.id })
    )
    const hook = setup()
    api.status.mockResolvedValue(proposal)
    await act(() => hook.result.current.act("recover"))
    expect(hook.result.current.phase).toBe("idle")
    expect(hook.result.current.proposal).toBeNull()
    expect(hook.applied).toHaveBeenCalledWith({ ...project, revision: 4 })
    expect(api.act).not.toHaveBeenCalled()
  })

  it("does not restore server proposals in local demo mode", async () => {
    sessionStorage.setItem(
      "kokoro-pending-local-proposal",
      JSON.stringify({ projectId: project.id, proposalId: proposal.id })
    )
    const hook = setup(false)
    await act(() => hook.result.current.send("의자 추가", null))
    expect(hook.result.current.locked).toBe(false)
    expect(hook.prepare).not.toHaveBeenCalled()
    expect(api.status).not.toHaveBeenCalled()
  })

  it("does not call a fallback when the local model fails", async () => {
    api.interpret.mockRejectedValue(new Error("모델 연결 실패"))
    const hook = setup()
    await act(() => hook.result.current.send("의자 추가", null))
    expect(api.preview).not.toHaveBeenCalled()
    expect(hook.applied).not.toHaveBeenCalled()
    expect(hook.result.current.error).toContain("모델 연결 실패")
    expect(hook.result.current.phase).toBe("idle")
    expect(hook.release).toHaveBeenCalledOnce()
  })

  it("resubmits the same interpretation after an explicit target choice, without asking the model again", async () => {
    api.preview.mockRejectedValueOnce(new Error("choice"))
    api.choice.mockReturnValueOnce({
      code: "AMBIGUOUS_TARGET",
      detail: "선택",
      choiceKey: "0:target",
      candidates: [{ id: "second-chair", name: "의자" }],
    })
    const hook = setup()
    await act(() => hook.result.current.send("의자 삭제", null))
    expect(hook.result.current.phase).toBe("choice")
    await act(() => hook.result.current.choose("second-chair"))
    expect(api.interpret).toHaveBeenCalledTimes(1)
    expect(api.preview).toHaveBeenLastCalledWith(
      project,
      intent,
      null,
      { "0:target": "second-chair" },
      undefined
    )
    expect(hook.result.current.phase).toBe("preview")
  })

  it("a double click sends only one confirmation", async () => {
    let resolve!: (value: LayoutProposal) => void
    api.act.mockImplementation(
      () =>
        new Promise<LayoutProposal>((done) => {
          resolve = done
        })
    )
    const hook = setup()
    await act(() => hook.result.current.send("의자 추가", null))
    let first!: Promise<void>
    act(() => {
      first = hook.result.current.act("confirm")
      void hook.result.current.act("confirm")
    })
    expect(api.act).toHaveBeenCalledTimes(1)
    await act(async () => {
      resolve({ ...proposal, status: "APPLIED" })
      await first
    })
    expect(hook.result.current.locked).toBe(false)
  })

  it("a stale result refreshes the project before enabling a new request", async () => {
    const hook = setup()
    await act(() => hook.result.current.send("의자 추가", null))
    api.act.mockRejectedValue(new ApiError("stale", 409, false))
    await act(() => hook.result.current.act("confirm"))
    api.status.mockResolvedValue({ ...proposal, status: "STALE" })
    await act(() => hook.result.current.act("recover"))
    expect(hook.applied).toHaveBeenCalledWith({ ...project, revision: 4 })
    expect(hook.result.current.phase).toBe("idle")
  })

  it("failed status reads preserve recovery while an authoritative 404 permits leaving it", async () => {
    sessionStorage.setItem(
      "kokoro-pending-local-proposal",
      JSON.stringify({ projectId: project.id, proposalId: proposal.id })
    )
    const hook = setup()
    api.status.mockRejectedValueOnce(new ApiError("network", null, true))
    await act(() => hook.result.current.act("recover"))
    expect(hook.result.current.locked).toBe(true)
    api.status.mockRejectedValueOnce(new ApiError("missing", 404, false))
    await act(() => hook.result.current.act("recover"))
    expect(hook.result.current.locked).toBe(false)
    expect(sessionStorage.getItem("kokoro-pending-local-proposal")).toBeNull()
  })
})
