import { sampleRoom } from "./sample-room"
import type { Furniture, Project } from "./types"
import { parseFurnitureCatalog } from "./furniture-catalog"
import catalogSource from "../../../../docs/contracts/furniture-catalog.json?raw"

export const catalog = parseFurnitureCatalog(JSON.parse(catalogSource))

function sampleFurniture(
  id: string,
  catalogId: string,
  x: number,
  z: number,
  rotation = 0
): Furniture {
  const entry = catalog.find((item) => item.id === catalogId)
  if (!entry)
    throw new Error(`샘플 가구를 카탈로그에서 찾을 수 없습니다: ${catalogId}`)
  return {
    id,
    catalogId,
    x,
    z,
    rotation,
    name: entry.name,
    category: entry.category,
    color: entry.color,
  }
}

export const sampleProject: Project = {
  id: "living-room-01",
  name: "성수동 단독주택",
  roomType: "주택",
  dimensions: {
    width: sampleRoom.bounds.width,
    depth: sampleRoom.bounds.depth,
    height: sampleRoom.wallHeight,
  },
  room: sampleRoom,
  floorPlan: {
    fileName: "sample-floor-plan.pdf",
    size: 842000,
    status: "READY",
    progress: 100,
    uploadedAt: new Date().toISOString(),
  },
  furniture: [
    sampleFurniture("sofa-01", "sofa-cloud", 4.5, 5.6),
    sampleFurniture("table-01", "table-oak", 4.8, 4.2),
    sampleFurniture("chair-01", "chair-shell", 4.5, 3.0, 25),
    sampleFurniture("plant-01", "plant-olive", 6.0, 5.9),
    sampleFurniture("bed-01", "bed-linen", 1.18, 4.22),
    sampleFurniture("dining-01", "table-dining", 4.86, 0.92),
    sampleFurniture("bench-01", "chair-bench", 4.86, 1.7),
    sampleFurniture("shelf-01", "storage-open", 9.12, 0.32),
  ],
  updatedAt: new Date().toISOString(),
}

export const initialMessages = [
  {
    id: "welcome",
    role: "assistant" as const,
    text: "어떤 방을 만들고 싶나요? 원하는 분위기와 필요한 가구를 알려 주면 함께 배치해 볼게요.",
  },
]
