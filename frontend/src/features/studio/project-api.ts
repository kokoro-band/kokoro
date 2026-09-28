import { request, UPLOAD_TIMEOUT_MS } from "@/lib/http-client"

import { catalog, sampleProject } from "./data"
import { withObjectParticle } from "./format"
import { containsPoint } from "./house-navigation"
import { labelPoint } from "./room-builder"
import { sampleRoom } from "./sample-room"
import type {
  ChatCommandResponse,
  Furniture,
  LayoutCommand,
  Point2,
  Project,
  RoomModel,
} from "./types"

const storageKey = "kokoro-remodel-project-v1"
const activeProjectStorageKey = "kokoro-active-server-project-v1"
export const isServerMode = import.meta.env.VITE_API_MODE === "server"
const projectIdPattern = /^[A-Za-z0-9_-]{1,64}$/

function projectPath(projectId: string) {
  if (!projectIdPattern.test(projectId)) {
    throw new Error("올바르지 않은 프로젝트 ID입니다.")
  }
  return `/projects/${projectId}`
}

export function readSavedProject(): Project {
  try {
    const raw = localStorage.getItem(storageKey)
    if (raw) {
      const saved = JSON.parse(raw) as Project
      if (saved.id && Array.isArray(saved.furniture) && saved.dimensions)
        return saved
    }
  } catch {
    // 손상된 기기 저장소는 샘플 프로젝트로 복구합니다.
  }
  return structuredClone(sampleProject)
}

export function readActiveProjectId(): string | null {
  try {
    return localStorage.getItem(activeProjectStorageKey)
  } catch {
    return null
  }
}

export function rememberActiveProject(projectId: string) {
  try {
    localStorage.setItem(activeProjectStorageKey, projectId)
  } catch {
    // The open project still works when browser storage is unavailable.
  }
}

export function getProject(projectId: string) {
  return request<Project>({ url: projectPath(projectId) })
}

export async function saveProject(project: Project): Promise<Project> {
  const updated = { ...project, updatedAt: new Date().toISOString() }
  if (isServerMode) {
    return request<Project>({
      url: `${projectPath(project.id)}/layout`,
      method: "PUT",
      data: { furniture: project.furniture },
    })
  }
  localStorage.setItem(storageKey, JSON.stringify(updated))
  return updated
}

export async function saveRoom(
  project: Project,
  room: RoomModel
): Promise<Project> {
  const updated = { ...project, room, updatedAt: new Date().toISOString() }
  if (isServerMode) {
    return request<Project>({
      url: `${projectPath(project.id)}/room`,
      method: "PUT",
      data: { room },
    })
  }
  localStorage.setItem(storageKey, JSON.stringify(updated))
  return updated
}

export async function uploadPlan(
  project: Project,
  file: File
): Promise<Project> {
  if (isServerMode) {
    const body = new FormData()
    body.append("file", file)
    return request<Project>({
      url: `${projectPath(project.id)}/floor-plan`,
      method: "POST",
      data: body,
      timeout: UPLOAD_TIMEOUT_MS,
    })
  }
  return {
    ...project,
    room: sampleRoom,
    floorPlan: {
      fileName: file.name,
      size: file.size,
      status: "READY",
      progress: 100,
      uploadedAt: new Date().toISOString(),
    },
  }
}

export async function createProject(name: string): Promise<Project> {
  const project: Project = {
    ...structuredClone(sampleProject),
    id: crypto.randomUUID(),
    name,
    room: undefined,
    furniture: [],
    floorPlan: {
      fileName: "",
      size: 0,
      status: "EMPTY",
      progress: 0,
      uploadedAt: null,
    },
  }
  if (!isServerMode) return project
  return request<Project>({
    url: "/projects",
    method: "POST",
    data: { name, roomType: project.roomType, dimensions: project.dimensions },
  })
}

export function makeFurniture(catalogId: string, x = 0, z = 0): Furniture {
  const item = catalog.find((entry) => entry.id === catalogId) ?? catalog[0]
  return {
    id: crypto.randomUUID(),
    catalogId: item.id,
    name: item.name,
    category: item.category,
    x,
    z,
    rotation: 0,
    color: item.color,
  }
}

export async function sendCommand(
  project: Project,
  message: string,
  focus?: Point2[],
  furnitureId?: string
): Promise<ChatCommandResponse> {
  if (isServerMode) {
    return request<ChatCommandResponse>({
      url: `${projectPath(project.id)}/layout/commands`,
      method: "POST",
      data: { message, ...(furnitureId ? { furnitureId } : {}) },
    })
  }

  const normalized = message.replaceAll(" ", "")
  const bounds = project.room?.bounds ?? {
    width: project.dimensions.width,
    depth: project.dimensions.depth,
  }
  // 방을 보고 있을 때는 그 방 안에만 가구를 놓습니다.
  const area = focus?.length
    ? {
        x: Math.min(...focus.map(([x]) => x)),
        z: Math.min(...focus.map(([, z]) => z)),
        width:
          Math.max(...focus.map(([x]) => x)) -
          Math.min(...focus.map(([x]) => x)),
        depth:
          Math.max(...focus.map(([, z]) => z)) -
          Math.min(...focus.map(([, z]) => z)),
      }
    : { x: 0, z: 0, ...bounds }
  const at = (widthRatio: number, depthRatio: number): [number, number] => {
    const x = area.x + area.width * widthRatio
    const z = area.z + area.depth * depthRatio
    const [safeX, safeZ] =
      focus?.length && !containsPoint(focus, x, z) ? labelPoint(focus) : [x, z]
    return [Math.round(safeX * 10) / 10, Math.round(safeZ * 10) / 10]
  }
  let furniture = [...project.furniture]
  const actions: string[] = []
  const commands: LayoutCommand[] = []
  const targets = [
    { word: "소파", id: "sofa-cloud", spot: at(0.27, 0.68) },
    { word: "테이블", id: "table-oak", spot: at(0.55, 0.5) },
    { word: "의자", id: "chair-shell", spot: at(0.72, 0.32) },
    { word: "화분", id: "plant-olive", spot: at(0.84, 0.75) },
    { word: "램프", id: "lamp-arc", spot: at(0.16, 0.35) },
  ]
  if (
    normalized.includes("비워") ||
    normalized.includes("전부삭제") ||
    normalized.includes("전체삭제") ||
    normalized.includes("모두삭제")
  ) {
    const proposedCommands: LayoutCommand[] = [
      {
        type: "CLEAR",
        catalogId: null,
        furnitureId: null,
        x: null,
        z: null,
        rotation: null,
      },
    ]
    const proposalId = crypto.randomUUID()
    localProposals.set(proposalId, {
      projectId: project.id,
      project: { ...project, furniture: [] },
      proposedCommands,
    })
    return {
      reply: "가구를 모두 삭제할까요?",
      appliedActions: [],
      commands: proposedCommands,
      requiresConfirmation: true,
      project,
      proposalId,
      expiresAt: null,
      proposedCommands,
      candidates: [],
    }
  } else {
    for (const target of targets) {
      const matches =
        normalized.includes(target.word) ||
        (target.word === "화분" && normalized.includes("식물")) ||
        (target.word === "테이블" && normalized.includes("책상"))
      if (!matches) continue
      const [x, z] = normalized.includes("창가") ? at(0.72, 0.24) : target.spot
      const matchesForTarget = furniture.filter(
        (item) => item.catalogId === target.id
      )
      if (
        matchesForTarget.length > 1 &&
        !furnitureId &&
        (normalized.includes("옮") || normalized.includes("이동"))
      ) {
        return {
          reply: "어떤 가구를 대상으로 할지 선택해 주세요.",
          appliedActions: [],
          commands: [
            {
              type: "MOVE",
              catalogId: target.id,
              furnitureId: null,
              x,
              z,
              rotation: null,
            },
          ],
          requiresConfirmation: false,
          project,
          proposalId: null,
          expiresAt: null,
          proposedCommands: [],
          candidates: matchesForTarget.map(({ id, name }) => ({
            furnitureId: id,
            name,
          })),
        }
      }
      const existing = furnitureId
        ? matchesForTarget.find((item) => item.id === furnitureId)
        : matchesForTarget[0]
      if (furnitureId && !existing)
        throw new Error("선택한 가구를 찾지 못했어요. 다시 요청해 주세요.")
      if (
        existing &&
        (normalized.includes("옮") || normalized.includes("이동"))
      ) {
        furniture = furniture.map((item) =>
          item.id === existing.id ? { ...item, x, z } : item
        )
        actions.push(`${existing.name} 위치를 조정했어요`)
        commands.push({
          type: "MOVE",
          catalogId: target.id,
          furnitureId: existing.id,
          x,
          z,
          rotation: null,
        })
      } else {
        const added = makeFurniture(target.id, x, z)
        furniture.push(added)
        actions.push(`${withObjectParticle(target.word)} 놓았어요`)
        commands.push({
          type: "ADD",
          catalogId: target.id,
          furnitureId: added.id,
          x,
          z,
          rotation: null,
        })
      }
    }
    if (normalized.includes("미니멀") && actions.length === 0) {
      furniture = [
        makeFurniture("sofa-cloud", ...at(0.28, 0.68)),
        makeFurniture("table-oak", ...at(0.55, 0.5)),
        makeFurniture("plant-olive", ...at(0.84, 0.76)),
      ]
      actions.push("소파와 테이블과 식물로 간결한 배치를 만들었어요")
      commands.push({
        type: "CLEAR",
        catalogId: null,
        furnitureId: null,
        x: null,
        z: null,
        rotation: null,
      })
      for (const item of furniture)
        commands.push({
          type: "ADD",
          catalogId: item.catalogId,
          furnitureId: item.id,
          x: item.x,
          z: item.z,
          rotation: null,
        })
      const proposalId = crypto.randomUUID()
      localProposals.set(proposalId, {
        projectId: project.id,
        project: { ...project, furniture },
        proposedCommands: commands,
      })
      return {
        reply: "기존 가구를 비우고 새 배치를 적용할까요?",
        appliedActions: [],
        commands,
        requiresConfirmation: true,
        project,
        proposalId,
        expiresAt: null,
        proposedCommands: commands,
        candidates: [],
      }
    }
  }
  return {
    reply: actions.length
      ? `${actions.join(". ")}. 가구를 끌어서 옮기거나 선택한 가구에서 위치를 바꿔 보세요.`
      : "소파, 테이블, 의자, 화분, 램프를 놓을 수 있어요. ‘창가에 의자를 옮겨줘’처럼 말해 보세요.",
    project: { ...project, furniture },
    appliedActions: actions,
    commands,
    requiresConfirmation: false,
    proposalId: null,
    expiresAt: null,
    proposedCommands: [],
    candidates: [],
  }
}

const localProposals = new Map<
  string,
  {
    projectId: string
    project: Project
    proposedCommands: LayoutCommand[]
  }
>()

export async function confirmCommand(
  projectId: string,
  proposalId: string
): Promise<ChatCommandResponse> {
  if (isServerMode) {
    return request<ChatCommandResponse>({
      url: `${projectPath(projectId)}/layout/commands/confirm`,
      method: "POST",
      data: { proposalId },
    })
  }
  const proposal = localProposals.get(proposalId)
  if (!proposal || proposal.projectId !== projectId)
    throw new Error("제안을 찾지 못했어요. 다시 요청해 주세요.")
  return {
    reply: "배치를 적용했어요.",
    appliedActions: ["전체 삭제"],
    commands: proposal.proposedCommands,
    requiresConfirmation: false,
    project: proposal.project,
    proposalId,
    expiresAt: null,
    proposedCommands: [],
    candidates: [],
  }
}
