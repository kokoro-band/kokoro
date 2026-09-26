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
  modelUrl?: string
}

export type Point2 = [x: number, z: number]

export type Wall = {
  id: string
  a: Point2
  b: Point2
  thickness: number
}

export type Opening = {
  id: string
  wallId: string
  type: "door" | "window"
  from: number
  to: number
  bottom: number
  top: number
}

export type RoomLabel = {
  name: string
  polygon: Point2[]
}

export type RoomModel = {
  version: 2
  unit: "m"
  wallHeight: number
  outline: Point2[]
  walls: Wall[]
  openings: Opening[]
  rooms: RoomLabel[]
  bounds: { width: number; depth: number }
  spawn?: Point2
  source?: RoomSource
}

export type RoomSource = {
  areaPyeong: number
  roomCount: number
  preset: string
}

export type Project = {
  revision?: number
  id: string
  name: string
  roomType: string
  dimensions: { width: number; depth: number; height: number }
  room?: RoomModel
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
