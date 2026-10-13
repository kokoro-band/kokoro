import { sampleRoom } from "./sample-room"
import type { Project } from "./types"
import { parseFurnitureCatalog } from "./furniture-catalog"
import catalogSource from "../../../../docs/contracts/furniture-catalog.json?raw"

export const catalog = parseFurnitureCatalog(JSON.parse(catalogSource))

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
    {
      id: "sofa-01",
      catalogId: "sofa-cloud",
      name: "클라우드 소파",
      category: "소파",
      x: 4.5,
      z: 5.6,
      rotation: 0,
      color: "#D8C8B8",
    },
    {
      id: "table-01",
      catalogId: "table-oak",
      name: "오크 테이블",
      category: "테이블",
      x: 4.8,
      z: 4.2,
      rotation: 0,
      color: "#B98958",
    },
    {
      id: "chair-01",
      catalogId: "chair-shell",
      name: "셸 체어",
      category: "의자",
      x: 4.5,
      z: 3.0,
      rotation: 25,
      color: "#4A665A",
    },
    {
      id: "plant-01",
      catalogId: "plant-olive",
      name: "올리브 화분",
      category: "장식",
      x: 6.0,
      z: 5.9,
      rotation: 0,
      color: "#69805E",
    },
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
