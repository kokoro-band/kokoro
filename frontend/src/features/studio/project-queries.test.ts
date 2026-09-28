import { QueryClient } from "@tanstack/react-query"
import { beforeEach, describe, expect, it, vi } from "vite-plus/test"

import { ApiError } from "@/lib/http-client"

import { sampleProject } from "./data"
import {
  createProject,
  getProject,
  saveProject,
  sendCommand,
  uploadPlan,
} from "./project-api"
import {
  createProjectMutationOptions,
  projectKeys,
  projectQueryOptions,
  saveProjectMutationOptions,
  sendCommandMutationOptions,
  shouldRetryProjectRequest,
  uploadPlanMutationOptions,
} from "./project-queries"

vi.mock("./project-api", () => ({
  createProject: vi.fn(),
  getProject: vi.fn(),
  saveProject: vi.fn(),
  sendCommand: vi.fn(),
  uploadPlan: vi.fn(),
}))

const project = structuredClone(sampleProject)
const updatedProject = {
  ...project,
  name: "서버가 반환한 프로젝트",
  updatedAt: "2026-03-01T00:00:00Z",
}

function queryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("project queries", () => {
  it("loads a project under its detail key", async () => {
    vi.mocked(getProject).mockResolvedValue(project)
    const client = queryClient()

    await expect(
      client.fetchQuery(projectQueryOptions(project.id))
    ).resolves.toEqual(project)
    expect(client.getQueryData(projectKeys.detail(project.id))).toEqual(project)
  })

  it("updates the detail cache after save", async () => {
    vi.mocked(saveProject).mockResolvedValue(updatedProject)
    const client = queryClient()
    client.setQueryData(projectKeys.detail(project.id), project)

    const mutation = client
      .getMutationCache()
      .build(client, saveProjectMutationOptions(client, project.id))
    await mutation.execute(project)

    expect(client.getQueryData(projectKeys.detail(project.id))).toEqual(
      updatedProject
    )
  })

  it("updates the detail cache for create, upload, and command mutations", async () => {
    vi.mocked(createProject).mockResolvedValue(updatedProject)
    vi.mocked(uploadPlan).mockResolvedValue(updatedProject)
    vi.mocked(sendCommand).mockResolvedValue({
      reply: "완료",
      project: updatedProject,
      appliedActions: ["완료"],
      commands: [],
      requiresConfirmation: false,
      proposalId: null,
      expiresAt: null,
      proposedCommands: [],
      candidates: [],
    })
    const client = queryClient()
    const file = new File(["plan"], "plan.pdf", { type: "application/pdf" })

    await client
      .getMutationCache()
      .build(client, createProjectMutationOptions(client))
      .execute("새 프로젝트")
    expect(client.getQueryData(projectKeys.detail(project.id))).toEqual(
      updatedProject
    )

    client.removeQueries({ queryKey: projectKeys.detail(project.id) })
    await client
      .getMutationCache()
      .build(client, uploadPlanMutationOptions(client, project.id))
      .execute({ project, file })
    expect(client.getQueryData(projectKeys.detail(project.id))).toEqual(
      updatedProject
    )

    client.removeQueries({ queryKey: projectKeys.detail(project.id) })
    await client
      .getMutationCache()
      .build(client, sendCommandMutationOptions(client, project.id))
      .execute({ project, message: "소파를 옮겨줘" })
    expect(client.getQueryData(projectKeys.detail(project.id))).toEqual(
      updatedProject
    )
  })

  it("does not change cached data when a mutation fails", async () => {
    const error = new ApiError("프로젝트가 없습니다.", 404, false)
    vi.mocked(saveProject).mockRejectedValue(error)
    const client = queryClient()
    client.setQueryData(projectKeys.detail(project.id), project)

    const mutation = client
      .getMutationCache()
      .build(client, saveProjectMutationOptions(client, project.id))
    await expect(mutation.execute(project)).rejects.toBe(error)
    expect(client.getQueryData(projectKeys.detail(project.id))).toEqual(project)
  })
})

describe("project retry policy", () => {
  it("retries a network error at most twice", () => {
    const error = new ApiError("network", null, true)

    expect(shouldRetryProjectRequest(0, error)).toBe(true)
    expect(shouldRetryProjectRequest(1, error)).toBe(true)
    expect(shouldRetryProjectRequest(2, error)).toBe(false)
  })

  it("does not retry a 404", () => {
    expect(
      shouldRetryProjectRequest(0, new ApiError("missing", 404, false))
    ).toBe(false)
  })

  it("only retries the idempotent save mutation", () => {
    const client = queryClient()

    expect(createProjectMutationOptions(client).retry).toBe(false)
    expect(uploadPlanMutationOptions(client, project.id).retry).toBe(false)
    expect(sendCommandMutationOptions(client, project.id).retry).toBe(false)
    expect(saveProjectMutationOptions(client, project.id).retry).toBe(
      shouldRetryProjectRequest
    )
  })
})
