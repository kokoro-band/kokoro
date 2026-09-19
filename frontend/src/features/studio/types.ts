export type ViewMode = "3d" | "2d" | "vr"
export type Category = "전체" | "소파" | "테이블" | "의자" | "장식"

export type Furniture = {
  id: string
  catalogId: string
  name: string
  category: Exclude<Category, "전체">
  x: number
  z: number
  rotation: number
  color: string
}

export type CatalogItem = {
  id: string
  name: string
  category: Exclude<Category, "전체">
  description: string
  price: number
  width: number
  depth: number
  color: string
}

export type Project = {
  id: string
  name: string
  roomType: string
  dimensions: { width: number; depth: number; height: number }
  floorPlan: {
    fileName: string
    size: number
    status: "EMPTY" | "PROCESSING" | "READY" | "FAILED"
    progress: number
    uploadedAt: string | null
  }
  furniture: Furniture[]
  updatedAt: string
}

export type ChatMessage = {
  id: string
  role: "assistant" | "user"
  text: string
}

export type ProjectLoadState =
  | { status: "loading"; message: "" }
  | { status: "ready"; message: "" }
  | { status: "error"; message: string }

export type UploadAttempt = {
  file: File
  status: "PROCESSING" | "FAILED"
  phase: "UPLOADING" | "CONVERTING"
  progress: number
  error: string
  retryable: boolean
}
