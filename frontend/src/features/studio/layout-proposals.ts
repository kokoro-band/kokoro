import { request, ApiError } from "@/lib/http-client"
import type { LayoutIntent } from "./local-ai"
import type { CatalogItem, Furniture, Project } from "./types"

export type LayoutProposal = {
  id: string
  status: "PENDING" | "APPLIED" | "CANCELLED" | "EXPIRED" | "STALE"
  baseRevision: number
  expiresAt: string
  proposedFurniture: Furniture[]
  actions: string[]
  result: Project | null
}
export type LayoutChoice = {
  code: string
  detail: string
  choiceKey: string | null
  candidates: { id: string; name: string }[]
}

export async function getServerCatalog() {
  const response = await request<{ items: CatalogItem[] }>({
    url: "/furniture-catalog",
  })
  if (!Array.isArray(response.items) || !response.items.length)
    throw new Error("서버 가구 목록이 비어 있어요.")
  return response.items
}
function base(id: string) {
  return `/projects/${encodeURIComponent(id)}/layout/proposals`
}
export function previewIntent(
  project: Project,
  intent: LayoutIntent,
  selectedFurnitureId: string | null,
  choices: Record<string, string>,
  focusRoomName?: string
) {
  if (!Number.isSafeInteger(project.revision))
    throw new Error(
      "프로젝트 버전을 읽지 못했어요. 서버 저장본을 다시 불러와 주세요."
    )
  return request<LayoutProposal>({
    url: `${base(project.id)}/intent`,
    method: "POST",
    data: {
      expectedRevision: project.revision,
      intent: { reply: intent.reply, commands: intent.commands },
      selectedFurnitureId,
      choices,
      focusRoomName,
    },
  })
}
export function proposalStatus(projectId: string, proposalId: string) {
  return request<LayoutProposal>({
    url: `${base(projectId)}/${encodeURIComponent(proposalId)}`,
  })
}
export function actOnProposal(
  projectId: string,
  proposalId: string,
  action: "confirm" | "cancel"
) {
  return request<LayoutProposal>({
    url: `${base(projectId)}/${encodeURIComponent(proposalId)}/${action}`,
    method: "POST",
  })
}
export function readLayoutChoice(error: unknown): LayoutChoice | null {
  if (!(error instanceof ApiError) || error.status !== 422) return null
  const cause = error.cause as
    | { response?: { data?: LayoutChoice } }
    | undefined
  const choice = cause?.response?.data
  if (!choice || !Array.isArray(choice.candidates)) return null
  return choice
}
