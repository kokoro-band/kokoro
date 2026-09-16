import { catalog, sampleProject } from "./data"
import type { Furniture, Project } from "./types"

const storageKey = "kokoro-remodel-project-v1"
export const isServerMode = import.meta.env.VITE_API_MODE === "server"
const apiBase = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080/api"

export function readSavedProject(): Project {
  try {
    const raw = localStorage.getItem(storageKey)
    if (raw) {
      const saved = JSON.parse(raw) as Project
      if (saved.id && Array.isArray(saved.furniture) && saved.dimensions) return saved
    }
  } catch {
    // 손상된 기기 저장소는 샘플 프로젝트로 복구합니다.
  }
  return structuredClone(sampleProject)
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${apiBase}${path}`, init)
  } catch {
    throw new Error("서버에 연결할 수 없습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.")
  }

  if (!response.ok) {
    let message = "서버 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요."
    try {
      const error = await response.json() as { detail?: unknown; message?: unknown }
      const detail = typeof error.detail === "string" ? error.detail : error.message
      if (typeof detail === "string" && detail.trim()) message = detail
    } catch {
      // Fall back to a status-based default message when the body is not a JSON error.
    }
    throw new Error(message)
  }
  return response.json() as Promise<T>
}

export async function saveProject(project: Project): Promise<Project> {
  const updated = { ...project, updatedAt: new Date().toISOString() }
  if (isServerMode) {
    return request<Project>(`/projects/${project.id}/layout`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ furniture: project.furniture }),
    })
  }
  localStorage.setItem(storageKey, JSON.stringify(updated))
  return updated
}

export async function uploadPlan(project: Project, file: File): Promise<Project> {
  if (isServerMode) {
    const body = new FormData()
    body.append("file", file)
    return request<Project>(`/projects/${project.id}/floor-plan`, { method: "POST", body })
  }
  return {
    ...project,
    floorPlan: { fileName: file.name, size: file.size, status: "READY", progress: 100, uploadedAt: new Date().toISOString() },
  }
}

export async function createProject(name: string): Promise<Project> {
  const project: Project = {
    ...structuredClone(sampleProject),
    id: crypto.randomUUID(),
    name,
    furniture: [],
    floorPlan: { fileName: "", size: 0, status: "EMPTY", progress: 0, uploadedAt: null },
  }
  if (!isServerMode) return project
  return request<Project>("/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, roomType: project.roomType, dimensions: project.dimensions }),
  })
}

export function makeFurniture(catalogId: string, x = 50, z = 50): Furniture {
  const item = catalog.find((entry) => entry.id === catalogId) ?? catalog[0]
  return { id: crypto.randomUUID(), catalogId: item.id, name: item.name, category: item.category, x, z, rotation: 0, color: item.color }
}

export async function sendCommand(project: Project, message: string): Promise<{ reply: string; project: Project }> {
  if (isServerMode) {
    return request(`/projects/${project.id}/layout/commands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    })
  }

  const normalized = message.replaceAll(" ", "")
  let furniture = [...project.furniture]
  const actions: string[] = []
  const targets = [
    { word: "소파", id: "sofa-cloud", x: 27, z: 68 },
    { word: "테이블", id: "table-oak", x: 55, z: 50 },
    { word: "의자", id: "chair-shell", x: 72, z: 32 },
    { word: "화분", id: "plant-olive", x: 84, z: 75 },
    { word: "램프", id: "lamp-arc", x: 16, z: 35 },
  ]
  if (normalized.includes("비워") || normalized.includes("전부삭제")) {
    furniture = []
    actions.push("가구를 모두 비웠어요")
  } else {
    for (const target of targets) {
      const matches = normalized.includes(target.word) || (target.word === "화분" && normalized.includes("식물")) || (target.word === "테이블" && normalized.includes("책상"))
      if (!matches) continue
      const x = normalized.includes("창가") ? 72 : target.x
      const z = normalized.includes("창가") ? 24 : target.z
      const existing = furniture.find((item) => item.category === catalog.find((entry) => entry.id === target.id)?.category)
      if (existing && (normalized.includes("옮") || normalized.includes("이동"))) {
        furniture = furniture.map((item) => item.id === existing.id ? { ...item, x, z } : item)
        actions.push(`${existing.name} 위치를 조정했어요`)
      } else {
        furniture.push(makeFurniture(target.id, x, z))
        actions.push(`${target.word}를 배치했어요`)
      }
    }
    if (normalized.includes("미니멀") && actions.length === 0) {
      furniture = [makeFurniture("sofa-cloud", 28, 68), makeFurniture("table-oak", 55, 50), makeFurniture("plant-olive", 84, 76)]
      actions.push("소파와 테이블과 식물로 간결한 배치를 만들었어요")
    }
  }
  return {
    reply: actions.length ? `${actions.join(". ")}. 가구를 드래그하거나 오른쪽 위치 값을 바꿔 보세요.` : "소파와 테이블과 의자와 화분과 램프를 배치할 수 있어요. 예를 들어 ‘창가에 의자를 옮겨줘’라고 말해 보세요.",
    project: { ...project, furniture },
  }
}
