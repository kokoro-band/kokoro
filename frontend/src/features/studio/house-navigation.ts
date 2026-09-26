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

/**
 * 좌표를 직접 입력했을 때 쓰는 자리 찾기입니다. 목표 자리에 둘 수 없으면 지금
 * 자리 쪽으로 0.1m씩 되돌아오며 둘 수 있는 가장 가까운 자리를 고릅니다.
 */
export function nearestPlacement(
  project: Project,
  focusRoom: RoomLabel | null,
  current: { x: number; z: number },
  target: { x: number; z: number }
) {
  if (canPlaceFurniture(project, focusRoom, target.x, target.z)) return target
  const steps = Math.ceil(
    Math.max(Math.abs(target.x - current.x), Math.abs(target.z - current.z)) /
      0.1
  )
  for (let step = 1; step < steps; step++) {
    const ratio = step / steps
    const x = Math.round((target.x + (current.x - target.x) * ratio) * 10) / 10
    const z = Math.round((target.z + (current.z - target.z) * ratio) * 10) / 10
    if (canPlaceFurniture(project, focusRoom, x, z)) return { x, z }
  }
  return { x: current.x, z: current.z }
}
