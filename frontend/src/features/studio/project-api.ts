import { request, UPLOAD_TIMEOUT_MS } from "@/lib/http-client"

import { catalog, sampleProject } from "./data"
import type { Furniture, Project, RoomModel } from "./types"

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
  message: string
): Promise<{ reply: string; project: Project }> {
  if (isServerMode) {
    return request<{ reply: string; project: Project }>({
      url: `${projectPath(project.id)}/layout/commands`,
      method: "POST",
      data: { message },
    })
  }

  const normalized = message.replaceAll(" ", "")
  const bounds = project.room?.bounds ?? {
    width: project.dimensions.width,
    depth: project.dimensions.depth,
  }
  const at = (widthRatio: number, depthRatio: number): [number, number] => [
    Math.round(bounds.width * widthRatio * 10) / 10,
    Math.round(bounds.depth * depthRatio * 10) / 10,
  ]
  let furniture = [...project.furniture]
  const actions: string[] = []
  const targets = [
    { word: "소파", id: "sofa-cloud", spot: at(0.27, 0.68) },
    { word: "테이블", id: "table-oak", spot: at(0.55, 0.5) },
    { word: "의자", id: "chair-shell", spot: at(0.72, 0.32) },
    { word: "화분", id: "plant-olive", spot: at(0.84, 0.75) },
    { word: "램프", id: "lamp-arc", spot: at(0.16, 0.35) },
  ]
  if (normalized.includes("비워") || normalized.includes("전부삭제")) {
    furniture = []
    actions.push("가구를 모두 비웠어요")
  } else {
    for (const target of targets) {
      const matches =
        normalized.includes(target.word) ||
        (target.word === "화분" && normalized.includes("식물")) ||
        (target.word === "테이블" && normalized.includes("책상"))
      if (!matches) continue
      const [x, z] = normalized.includes("창가") ? at(0.72, 0.24) : target.spot
      const existing = furniture.find(
        (item) =>
          item.category ===
          catalog.find((entry) => entry.id === target.id)?.category
      )
      if (
        existing &&
        (normalized.includes("옮") || normalized.includes("이동"))
      ) {
        furniture = furniture.map((item) =>
          item.id === existing.id ? { ...item, x, z } : item
        )
        actions.push(`${existing.name} 위치를 조정했어요`)
      } else {
        furniture.push(makeFurniture(target.id, x, z))
        actions.push(`${target.word}를 배치했어요`)
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
  return {
    reply: actions.length
      ? `${actions.join(". ")}. 가구를 드래그하거나 오른쪽 위치 값을 바꿔 보세요.`
      : "소파와 테이블과 의자와 화분과 램프를 배치할 수 있어요. 예를 들어 ‘창가에 의자를 옮겨줘’라고 말해 보세요.",
    project: { ...project, furniture },
  }
}
