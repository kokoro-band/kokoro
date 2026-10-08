import { request, UPLOAD_TIMEOUT_MS } from "@/lib/http-client"

import { catalog, sampleProject } from "./data"
import {
  assertFurnitureCount,
  chatInputError,
  projectNameError,
} from "./input-limits"
import { withObjectParticle } from "./format"
import { parseFurnitureCatalog } from "./furniture-catalog"
import { findFreePlacement } from "./furniture-motion"
import { containsPoint } from "./house-navigation"
import { labelPoint } from "./room-builder"
import { sampleRoom } from "./sample-room"
import type {
  CatalogItem,
  CommandResponse,
  Furniture,
  LayoutCommand,
  Point2,
  Project,
  RoomModel,
} from "./types"
import { commandLayoutKey, CommandReviewExpiredError } from "./command-review"
import {
  assertFurnitureWrite,
  maxStoredProjectLength,
  parseStoredProject,
} from "./project-validation"

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
  return readSavedProjectWithRecovery().project
}

export function readSavedProjectWithRecovery(): {
  project: Project
  recovery: "corrupt" | "unavailable" | null
} {
  let raw: string | null
  try {
    raw = localStorage.getItem(storageKey)
  } catch {
    return { project: structuredClone(sampleProject), recovery: "unavailable" }
  }
  if (raw === null)
    return { project: structuredClone(sampleProject), recovery: null }
  try {
    if (raw.length > maxStoredProjectLength)
      throw new Error("Project too large")
    return { project: parseStoredProject(JSON.parse(raw)), recovery: null }
  } catch {
    // Never erase or overwrite the original just because loading it failed.
    return { project: structuredClone(sampleProject), recovery: "corrupt" }
  }
}

function persistProject(project: Project): Project {
  assertFurnitureWrite(project.furniture)
  const validated = parseStoredProject(project)
  const raw = JSON.stringify(validated)
  if (raw.length > maxStoredProjectLength)
    throw new Error(
      "프로젝트가 너무 커서 기기에 저장하지 못했어요. 항목 수를 줄여 주세요."
    )
  try {
    localStorage.setItem(storageKey, raw)
  } catch (cause) {
    const quota = cause instanceof Error && cause.name === "QuotaExceededError"
    throw new Error(
      quota
        ? "기기의 저장 공간이 부족해 저장하지 못했어요. 편집 내용은 화면에 남아 있어요. 공간을 확보한 뒤 다시 저장해 주세요."
        : "기기 저장소에 저장하지 못했어요. 편집 내용은 화면에 남아 있어요. 브라우저 저장 권한을 확인한 뒤 다시 저장해 주세요.",
      { cause }
    )
  }
  return validated
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
  return request<Project>({ url: projectPath(projectId) }).then((project) =>
    validateServerProject(project, projectId)
  )
}

export function requireProjectRevision(project: Project): number {
  const revision = project?.revision
  if (
    typeof revision !== "number" ||
    !Number.isSafeInteger(revision) ||
    revision < 0
  )
    throw new Error(
      "서버 프로젝트 버전을 확인할 수 없어요. 최신 서버로 연결한 뒤 다시 불러와 주세요."
    )
  return revision
}

function validateServerProject(
  project: Project,
  projectId?: string,
  minimumRevision = 0
): Project {
  if (requireProjectRevision(project) < minimumRevision)
    throw new Error(
      "이전 버전의 서버 응답은 적용하지 않았어요. 최신 내용을 확인해 주세요."
    )
  if (
    !project ||
    typeof project.id !== "string" ||
    !projectIdPattern.test(project.id) ||
    (projectId && project.id !== projectId)
  )
    throw new Error("다른 프로젝트의 응답이라 적용하지 않았어요.")
  return project
}

function validateCommandResponse(response: CommandResponse, project: Project) {
  validateServerProject(response.project, project.id, project.revision)
  return response
}

export async function saveProject(project: Project): Promise<Project> {
  assertFurnitureWrite(project.furniture)
  const updated = { ...project, updatedAt: new Date().toISOString() }
  if (isServerMode) {
    return request<Project>({
      url: `${projectPath(project.id)}/layout`,
      method: "PUT",
      data: {
        furniture: project.furniture,
        expectedRevision: requireProjectRevision(project),
      },
    }).then((saved) =>
      validateServerProject(saved, project.id, project.revision)
    )
  }
  return persistProject(updated)
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
      data: { room, expectedRevision: requireProjectRevision(project) },
    }).then((saved) =>
      validateServerProject(saved, project.id, project.revision)
    )
  }
  return persistProject(updated)
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
    }).then((saved) =>
      validateServerProject(saved, project.id, project.revision)
    )
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
  const error = projectNameError(name)
  if (error) throw new Error(error)
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
  }).then((saved) => validateServerProject(saved))
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
  const error = chatInputError(message)
  if (error) throw new Error(error)
  if (isServerMode) {
    return request<CommandResponse>({
      url: `${projectPath(project.id)}/layout/commands`,
      method: "POST",
      data: {
        message,
        expectedRevision: requireProjectRevision(project),
        ...(furnitureId ? { furnitureId } : {}),
      },
    }).then((response) => validateCommandResponse(response, project))
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
  // 방을 보고 있을 때는 그 방의 가구만 바꾸고 다른 방 가구는 그대로 둡니다.
  const inFocus = (item: Furniture) =>
    !focus?.length || containsPoint(focus, item.x, item.z)
  let furniture = [...project.furniture]
  const actions: string[] = []
  const missing: string[] = []
  const blocked: string[] = []
  const focusRoom = focus?.length ? { name: "", polygon: focus } : null
  /** Same free-floor search as the catalog; null when nothing fits. */
  const place = (item: Furniture) =>
    findFreePlacement({ ...project, furniture }, item, focusRoom)
  const targets = [
    { word: "소파", id: "sofa-cloud", spot: at(0.27, 0.68) },
    { word: "테이블", id: "table-oak", spot: at(0.55, 0.5) },
    { word: "의자", id: "chair-shell", spot: at(0.72, 0.32) },
    { word: "화분", id: "plant-olive", spot: at(0.84, 0.75) },
    { word: "램프", id: "lamp-arc", spot: at(0.16, 0.35) },
  ]
  const moving = normalized.includes("옮") || normalized.includes("이동")
  const rotating = normalized.includes("회전")
  const removing =
    normalized.includes("삭제") ||
    normalized.includes("지워") ||
    normalized.includes("빼줘")
  const aliases: Record<string, string[]> = {
    화분: ["화분", "식물"],
    테이블: ["테이블", "책상"],
  }
  const wordsFor = (word: string) => aliases[word] ?? [word]
  // "소파 옆에 화분"의 소파는 기준 가구라서 새로 놓거나 바꾸지 않습니다.
  const anchorTarget = targets.find((target) =>
    wordsFor(target.word).some(
      (word) =>
        normalized.includes(`${word}옆`) || normalized.includes(`${word}의옆`)
    )
  )
  const matchesTarget = (word: string) =>
    word !== anchorTarget?.word &&
    wordsFor(word).some((alias) => normalized.includes(alias))
  const categoryOf = (catalogId: string) =>
    catalog.find((entry) => entry.id === catalogId)?.category
  const anchors = anchorTarget
    ? project.furniture.filter(
        (item) => inFocus(item) && item.category === categoryOf(anchorTarget.id)
      )
    : []
  if (anchorTarget && !removing && anchors.length !== 1)
    return {
      ...emptyCommandResponse(project),
      reply: anchors.length
        ? `기준이 될 ${withObjectParticle(anchorTarget.word)} 하나로 정할 수 없어요. 배치는 유지했어요.`
        : `기준이 될 ${withObjectParticle(anchorTarget.word)} ${focus?.length ? "이 방에서 " : ""}찾지 못했어요. 배치는 유지했어요.`,
    }
  /** Free spot touching one side of the anchor, or null when none is near. */
  const besideAnchor = (item: Furniture) => {
    const anchor = anchors[0]
    const a = catalog.find((entry) => entry.id === anchor.catalogId)
    const b = catalog.find((entry) => entry.id === item.catalogId)
    if (!a || !b) return null
    const turned = Math.round(anchor.rotation / 90) % 2 === 1
    const dx = ((turned ? a.depth : a.width) + b.width) / 2 + 0.1
    const dz = ((turned ? a.width : a.depth) + b.depth) / 2 + 0.1
    const spots: Point2[] = [
      [anchor.x + dx, anchor.z],
      [anchor.x - dx, anchor.z],
      [anchor.x, anchor.z + dz],
      [anchor.x, anchor.z - dz],
    ]
    for (const [x, z] of spots) {
      const placed = place({ ...item, x, z })
      if (placed && Math.hypot(placed.x - x, placed.z - z) <= 0.75)
        return placed
    }
    return null
  }
  const position = (item: Furniture) =>
    anchorTarget ? besideAnchor(item) : place(item)
  if (moving || rotating || removing) {
    const matches = project.furniture.filter(
      (item) =>
        inFocus(item) &&
        targets.some(
          (target) =>
            matchesTarget(target.word) &&
            item.category === categoryOf(target.id)
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
  const clearing =
    normalized.includes("비워") || normalized.includes("전부삭제")
  if (clearing) {
    furniture = furniture.filter((item) => !inFocus(item))
    actions.push(
      focus?.length ? "이 방의 가구를 모두 비웠어요" : "가구를 모두 비웠어요"
    )
  } else {
    for (const target of targets) {
      const matches = matchesTarget(target.word)
      if (!matches) continue
      const [x, z] = normalized.includes("창가") ? at(0.72, 0.24) : target.spot
      const existing = furniture.find(
        (item) =>
          (!furnitureId || item.id === furnitureId) &&
          inFocus(item) &&
          item.category ===
            catalog.find((entry) => entry.id === target.id)?.category
      )
      if ((moving || rotating || removing) && !existing) {
        if (focus?.length) missing.push(target.word)
        continue
      }
      if (removing) {
        if (existing) {
          furniture = furniture.filter((item) => item.id !== existing.id)
          actions.push(`${existing.name} 삭제`)
        }
        continue
      }
      if (existing && (moving || rotating)) {
        const target = rotating
          ? {
              ...existing,
              rotation:
                ((Number(normalized.match(/(-?\d+)도/)?.[1] ?? 90) % 360) +
                  360) %
                360,
            }
          : { ...existing, x, z }
        const placed = rotating ? place(target) : position(target)
        // A turn keeps its spot; it must not quietly slide somewhere else.
        if (
          !placed ||
          (rotating && (placed.x !== existing.x || placed.z !== existing.z))
        ) {
          blocked.push(target.name)
          continue
        }
        furniture = furniture.map((item) =>
          item.id === existing.id ? placed : item
        )
        actions.push(
          `${existing.name} ${rotating ? "방향을" : "위치를"} 조정했어요`
        )
      } else {
        const placed = position(makeFurniture(target.id, x, z))
        if (!placed) {
          blocked.push(target.word)
          continue
        }
        furniture.push(placed)
        actions.push(`${withObjectParticle(target.word)} 놓았어요`)
      }
    }
    if (normalized.includes("미니멀") && actions.length === 0) {
      furniture = furniture.filter((item) => !inFocus(item))
      const preset = [
        makeFurniture("sofa-cloud", ...at(0.28, 0.68)),
        makeFurniture("table-oak", ...at(0.55, 0.5)),
        makeFurniture("plant-olive", ...at(0.84, 0.76)),
      ]
      for (const item of preset) {
        const placed = place(item)
        if (placed) furniture.push(placed)
        else blocked.push(item.name)
      }
      if (blocked.length < preset.length)
        actions.push("소파와 테이블과 식물로 간결한 배치를 만들었어요")
    }
  }
  assertFurnitureCount(furniture.length)
  const blockedNote = blocked.length
    ? [
        `이 공간에는 ${blocked.map(withObjectParticle).join(", ")} 놓을 자리가 없어요`,
      ]
    : []
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
  if (clearing && !focus?.length)
    commands.splice(0, commands.length, { type: "CLEAR" })
  const result: CommandResponse = {
    ...emptyCommandResponse(project),
    reply: actions.length
      ? `${[...actions, ...blockedNote].join(". ")}. 가구를 끌어서 옮기거나 선택한 가구에서 위치를 바꿔 보세요.`
      : blocked.length
        ? `${blockedNote[0]}. 배치는 유지했어요.`
        : missing.length
          ? `이 방에서 ${missing.map(withObjectParticle).join(", ")} 찾지 못했어요. 다른 방의 가구는 그 방에서 바꿔 주세요.`
          : removing
            ? "삭제할 가구를 찾지 못했어요. 현재 가구 이름을 확인해 주세요."
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
    return proposeLocalCommand(
      project,
      result.project,
      commands,
      "가구를 지우기 전에 내용을 확인해 주세요.",
      actions
    )
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

/** A local preview stays in memory until the existing confirmation path saves it. */
export function proposeLocalCommand(
  project: Project,
  proposed: Project,
  commands: LayoutCommand[],
  reply: string,
  appliedActions: string[]
): CommandResponse {
  if (isServerMode)
    throw new Error("서버 모드에서는 로컬 제안을 만들 수 없어요.")
  assertFurnitureCount(proposed.furniture.length)
  if (!commands.length || proposed.id !== project.id)
    throw new Error("확인할 배치 변경이 없어요.")
  for (const [id, proposal] of localProposals)
    if (proposal.expires <= Date.now()) localProposals.delete(id)
  if (localProposals.size >= 50)
    localProposals.delete(localProposals.keys().next().value!)
  const proposalId = crypto.randomUUID()
  const expires = Date.now() + 5 * 60_000
  localProposals.set(proposalId, {
    baseKey: commandLayoutKey(project),
    expires,
    result: structuredClone({
      ...emptyCommandResponse(project),
      reply,
      commands,
      appliedActions,
      project: proposed,
    }),
    consumed: false,
  })
  return {
    ...emptyCommandResponse(project),
    reply,
    requiresConfirmation: true,
    proposalId,
    expiresAt: new Date(expires).toISOString(),
    proposedCommands: commands,
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
    }).then((response) => validateCommandResponse(response, project))
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

export async function fetchFurnitureCatalog(): Promise<CatalogItem[]> {
  if (!isServerMode) return catalog
  return parseFurnitureCatalog(
    await request<unknown>({ url: "/furniture-catalog" })
  )
}
