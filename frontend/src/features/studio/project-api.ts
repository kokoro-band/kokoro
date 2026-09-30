import { request, UPLOAD_TIMEOUT_MS } from "@/lib/http-client"

import { catalog, sampleProject } from "./data"
import { withObjectParticle } from "./format"
import { containsPoint } from "./house-navigation"
import { labelPoint } from "./room-builder"
import { sampleRoom } from "./sample-room"
import type {
  CommandResponse,
  Furniture,
  LayoutCommand,
  Point2,
  Project,
  RoomModel,
} from "./types"
import { commandLayoutKey, CommandReviewExpiredError } from "./command-review"

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
): Promise<CommandResponse> {
  if (isServerMode) {
    return request<CommandResponse>({
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
  const targets = [
    { word: "소파", id: "sofa-cloud", spot: at(0.27, 0.68) },
    { word: "테이블", id: "table-oak", spot: at(0.55, 0.5) },
    { word: "의자", id: "chair-shell", spot: at(0.72, 0.32) },
    { word: "화분", id: "plant-olive", spot: at(0.84, 0.75) },
    { word: "램프", id: "lamp-arc", spot: at(0.16, 0.35) },
  ]
  const moving = normalized.includes("옮") || normalized.includes("이동")
  const rotating = normalized.includes("회전")
  const matchesTarget = (word: string) =>
    normalized.includes(word) ||
    (word === "화분" && normalized.includes("식물")) ||
    (word === "테이블" && normalized.includes("책상"))
  if (moving || rotating) {
    const matches = project.furniture.filter((item) =>
      targets.some(
        (target) =>
          matchesTarget(target.word) &&
          item.category ===
            catalog.find((entry) => entry.id === target.id)?.category
      )
    )
    if (!furnitureId && matches.length > 1)
      return {
        ...emptyCommandResponse(project),
        reply: "어떤 가구를 바꿀지 골라 주세요.",
        candidates: matches.map((item) => ({
          furnitureId: item.id,
          name: item.name,
        })),
      }
    if (furnitureId && !matches.some((item) => item.id === furnitureId))
      throw new Error("대상 가구가 바뀌었어요. 다시 요청해 주세요.")
  }
  if (normalized.includes("비워") || normalized.includes("전부삭제")) {
    furniture = []
    actions.push("가구를 모두 비웠어요")
  } else {
    for (const target of targets) {
      const matches = matchesTarget(target.word)
      if (!matches) continue
      const [x, z] = normalized.includes("창가") ? at(0.72, 0.24) : target.spot
      const existing = furniture.find(
        (item) =>
          (!furnitureId || item.id === furnitureId) &&
          item.category ===
            catalog.find((entry) => entry.id === target.id)?.category
      )
      if ((moving || rotating) && !existing) continue
      if (existing && (moving || rotating)) {
        furniture = furniture.map((item) =>
          item.id === existing.id
            ? rotating
              ? {
                  ...item,
                  rotation:
                    ((Number(normalized.match(/(-?\d+)도/)?.[1] ?? 90) % 360) +
                      360) %
                    360,
                }
              : { ...item, x, z }
            : item
        )
        actions.push(
          `${existing.name} ${rotating ? "방향을" : "위치를"} 조정했어요`
        )
      } else {
        furniture.push(makeFurniture(target.id, x, z))
        actions.push(`${withObjectParticle(target.word)} 놓았어요`)
      }
    }
    if (normalized.includes("미니멀") && actions.length === 0) {
      furniture = [
        makeFurniture("sofa-cloud", ...at(0.28, 0.68)),
        makeFurniture("table-oak", ...at(0.55, 0.5)),
        makeFurniture("plant-olive", ...at(0.84, 0.76)),
      ]
      actions.push("소파와 테이블과 식물로 간결한 배치를 만들었어요")
    }
  }
  const commands: LayoutCommand[] = [
    ...project.furniture
      .filter((item) => !furniture.some((next) => next.id === item.id))
      .map((item): LayoutCommand => ({ type: "REMOVE", furnitureId: item.id })),
    ...furniture
      .filter(
        (item) =>
          JSON.stringify(item) !==
          JSON.stringify(
            project.furniture.find((before) => before.id === item.id)
          )
      )
      .map((item): LayoutCommand => ({
        type: project.furniture.some((before) => before.id === item.id)
          ? rotating
            ? "ROTATE"
            : "MOVE"
          : "ADD",
        catalogId: item.catalogId,
        furnitureId: item.id,
        x: item.x,
        z: item.z,
        rotation: item.rotation,
      })),
  ]
  if (normalized.includes("비워") || normalized.includes("전부삭제"))
    commands.splice(0, commands.length, { type: "CLEAR" })
  const result: CommandResponse = {
    ...emptyCommandResponse(project),
    reply: actions.length
      ? `${actions.join(". ")}. 가구를 끌어서 옮기거나 선택한 가구에서 위치를 바꿔 보세요.`
      : "소파, 테이블, 의자, 화분, 램프를 놓을 수 있어요. ‘창가에 의자를 옮겨줘’처럼 말해 보세요.",
    project: { ...project, furniture },
    commands,
    appliedActions: actions,
  }
  if (
    commands.some(
      (command) => command.type === "CLEAR" || command.type === "REMOVE"
    )
  ) {
    for (const [id, proposal] of localProposals)
      if (proposal.expires <= Date.now()) localProposals.delete(id)
    if (localProposals.size >= 50)
      localProposals.delete(localProposals.keys().next().value!)
    const proposalId = crypto.randomUUID()
    const expires = Date.now() + 5 * 60_000
    localProposals.set(proposalId, {
      baseKey: commandLayoutKey(project),
      expires,
      result: structuredClone(result),
      consumed: false,
    })
    return {
      ...result,
      reply: "가구를 지우기 전에 내용을 확인해 주세요.",
      project,
      appliedActions: [],
      requiresConfirmation: true,
      proposalId,
      expiresAt: new Date(expires).toISOString(),
      proposedCommands: commands,
    }
  }
  return result
}

function emptyCommandResponse(project: Project): CommandResponse {
  return {
    reply: "",
    project,
    appliedActions: [],
    commands: [],
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
    baseKey: string
    expires: number
    result: CommandResponse
    consumed: boolean
  }
>()

export async function confirmCommand(
  project: Project,
  proposalId: string
): Promise<CommandResponse> {
  if (isServerMode)
    return request<CommandResponse>({
      url: `${projectPath(project.id)}/layout/commands/confirm`,
      method: "POST",
      data: { proposalId },
    })
  const proposal = localProposals.get(proposalId)
  if (!proposal || proposal.result.project.id !== project.id)
    throw new CommandReviewExpiredError()
  if (proposal.consumed)
    return {
      ...emptyCommandResponse(project),
      reply: "이미 처리된 요청이에요.",
    }
  if (
    !proposal.consumed &&
    (proposal.expires <= Date.now() ||
      proposal.baseKey !== commandLayoutKey(project))
  )
    throw new CommandReviewExpiredError()
  const saved = await saveProject(structuredClone(proposal.result.project))
  proposal.consumed = true
  return {
    ...structuredClone(proposal.result),
    project: saved,
    proposalId,
    expiresAt: new Date(proposal.expires).toISOString(),
  }
}
