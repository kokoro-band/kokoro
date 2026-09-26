import { catalog } from "./data"
import { labelPoint } from "./room-builder"
import type { Furniture, Point2, Project, RoomLabel } from "./types"

export function containsPoint(polygon: Point2[], x: number, z: number) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i]
    const [xj, zj] = polygon[j]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi)
      inside = !inside
  }
  return inside
}

export function roomForFurniture(rooms: RoomLabel[], item: Furniture) {
  return rooms.findIndex((room) => containsPoint(room.polygon, item.x, item.z))
}

export function roomCenter(room: RoomLabel): Point2 {
  return labelPoint(room.polygon)
}

export function roomArea(room: RoomLabel) {
  const twiceArea = room.polygon.reduce((sum, [x, z], index) => {
    const [nextX, nextZ] = room.polygon[(index + 1) % room.polygon.length]
    return sum + x * nextZ - nextX * z
  }, 0)
  return Math.abs(twiceArea) / 2
}

export function furniturePrice(item: Furniture) {
  return catalog.find((entry) => entry.id === item.catalogId)?.price ?? 0
}

export function projectTotal(project: Project) {
  return project.furniture.reduce((sum, item) => sum + furniturePrice(item), 0)
}

/** 끌어서 옮길 때처럼 집 밖이나 지금 고른 방 밖에는 가구를 두지 않습니다. */
export function canPlaceFurniture(
  project: Project,
  focusRoom: RoomLabel | null,
  x: number,
  z: number
) {
  const margin = 0.2
  const bounds = project.room?.bounds ?? project.dimensions
  if (x < margin || z < margin) return false
  if (x > bounds.width - margin || z > bounds.depth - margin) return false
  if (project.room && !containsPoint(project.room.outline, x, z)) return false
  return !focusRoom || containsPoint(focusRoom.polygon, x, z)
}
