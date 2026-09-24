import {
  mutationOptions,
  queryOptions,
  type QueryClient,
} from "@tanstack/react-query"

import { ApiError } from "@/lib/http-client"

import {
  createProject,
  getProject,
  saveProject,
  saveRoom,
  sendCommand,
  uploadPlan,
} from "./project-api"
import type { Project, RoomModel } from "./types"

export const projectKeys = {
  all: ["projects"] as const,
  detail: (projectId: string) =>
    [...projectKeys.all, "detail", projectId] as const,
  create: () => [...projectKeys.all, "create"] as const,
  layout: (projectId: string) =>
    [...projectKeys.detail(projectId), "layout"] as const,
  room: (projectId: string) =>
    [...projectKeys.detail(projectId), "room"] as const,
  floorPlan: (projectId: string) =>
    [...projectKeys.detail(projectId), "floor-plan"] as const,
  command: (projectId: string) =>
    [...projectKeys.detail(projectId), "command"] as const,
}

export function shouldRetryProjectRequest(
  failureCount: number,
  error: unknown
) {
  return error instanceof ApiError && error.retryable && failureCount < 2
}

export function projectQueryOptions(projectId: string) {
  return queryOptions({
    queryKey: projectKeys.detail(projectId),
    queryFn: () => getProject(projectId),
  })
}

function cacheProject(queryClient: QueryClient, project: Project) {
  queryClient.setQueryData(projectKeys.detail(project.id), project)
}

export function createProjectMutationOptions(queryClient: QueryClient) {
  return mutationOptions({
    mutationKey: projectKeys.create(),
    mutationFn: createProject,
    retry: false,
    onSuccess: (project) => cacheProject(queryClient, project),
  })
}

export function saveProjectMutationOptions(
  queryClient: QueryClient,
  projectId: string
) {
  return mutationOptions({
    mutationKey: projectKeys.layout(projectId),
    mutationFn: saveProject,
    retry: shouldRetryProjectRequest,
    onSuccess: (project) => cacheProject(queryClient, project),
  })
}

export function saveRoomMutationOptions(
  queryClient: QueryClient,
  projectId: string
) {
  return mutationOptions({
    mutationKey: projectKeys.room(projectId),
    mutationFn: ({ project, room }: { project: Project; room: RoomModel }) =>
      saveRoom(project, room),
    retry: shouldRetryProjectRequest,
    onSuccess: (project) => cacheProject(queryClient, project),
  })
}

export function uploadPlanMutationOptions(
  queryClient: QueryClient,
  projectId: string
) {
  return mutationOptions({
    mutationKey: projectKeys.floorPlan(projectId),
    mutationFn: ({ project, file }: { project: Project; file: File }) =>
      uploadPlan(project, file),
    retry: false,
    onSuccess: (project) => cacheProject(queryClient, project),
  })
}

export function sendCommandMutationOptions(
  queryClient: QueryClient,
  projectId: string
) {
  return mutationOptions({
    mutationKey: projectKeys.command(projectId),
    mutationFn: ({ project, message }: { project: Project; message: string }) =>
      sendCommand(project, message),
    retry: false,
    onSuccess: (response) => cacheProject(queryClient, response.project),
  })
}
