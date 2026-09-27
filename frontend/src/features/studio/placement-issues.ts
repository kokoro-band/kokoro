import { catalog } from "./data"
import type { Furniture, Point2, Project, Wall } from "./types"

export type PlacementIssue = {
  furnitureId: string
  reason: string
}

type Box = {
  center: Point2
  x: Point2
  z: Point2
  width: number
  depth: number
}
const EPSILON = 1e-9
// Keep these diagnostics aligned with FurniturePlacementValidator. They describe
// repairable drafts, not save failures or certified building clearances.
const DOOR_CLEARANCE = 0.8
const dot = (a: Point2, b: Point2) => a[0] * b[0] + a[1] * b[1]
const subtract = (a: Point2, b: Point2): Point2 => [a[0] - b[0], a[1] - b[1]]
const cross = (a: Point2, b: Point2, c: Point2) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])

function footprint(item: Furniture): Box | null {
  const size = catalog.find((entry) => entry.id === item.catalogId)
  if (!size || ![item.x, item.z, item.rotation].every(Number.isFinite))
    return null
  const angle = (item.rotation * Math.PI) / 180
  return {
    center: [item.x, item.z],
    x: [Math.cos(angle), Math.sin(angle)],
    z: [-Math.sin(angle), Math.cos(angle)],
    width: size.width / 2,
    depth: size.depth / 2,
  }
}

function wallBox(wall: Wall): Box {
  const [dx, dz] = subtract(wall.b, wall.a)
  const length = Math.hypot(dx, dz)
  const x: Point2 = length ? [dx / length, dz / length] : [1, 0]
  return {
    center: [(wall.a[0] + wall.b[0]) / 2, (wall.a[1] + wall.b[1]) / 2],
    x,
    z: [-x[1], x[0]],
    width: length / 2,
    depth: wall.thickness / 2,
  }
}

function overlaps(a: Box, b: Box) {
  const radius = (box: Box, axis: Point2) =>
    Math.abs(dot(box.x, axis)) * box.width +
    Math.abs(dot(box.z, axis)) * box.depth
  return [a.x, a.z, b.x, b.z].every(
    (axis) =>
      Math.abs(dot(subtract(b.center, a.center), axis)) <
      radius(a, axis) + radius(b, axis) - EPSILON
  )
}

function contains(polygon: Point2[], point: Point2) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j]
    const b = polygon[i]
    const edge = subtract(b, a)
    const delta = subtract(point, a)
    const length = Math.hypot(...edge)
    if (
      length === 0
        ? Math.hypot(...delta) <= 1e-6
        : Math.abs(cross(a, b, point)) / length <= 1e-6 &&
          dot(delta, edge) >= -1e-6 &&
          dot(delta, edge) <= length * length + 1e-6
    )
      return true
    if (
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside
  }
  return inside
}

function insideRoom(polygon: Point2[], box: Box) {
  const corners: Point2[] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([x, z]) => [
    box.center[0] + box.x[0] * box.width * x + box.z[0] * box.depth * z,
    box.center[1] + box.x[1] * box.width * x + box.z[1] * box.depth * z,
  ])
  if (!corners.every((point) => contains(polygon, point))) return false
  const straddles = (a: number, b: number) =>
    (a > EPSILON && b < -EPSILON) || (a < -EPSILON && b > EPSILON)
  return !corners.some((a, i) => {
    const b = corners[(i + 1) % corners.length]
    return polygon.some((c, j) => {
      const d = polygon[(j + 1) % polygon.length]
      return (
        straddles(cross(a, b, c), cross(a, b, d)) &&
        straddles(cross(c, d, a), cross(c, d, b))
      )
    })
  })
}

/** One actionable reason per furniture item, including both sides of a collision. */
export function placementIssues(project: Project): PlacementIssue[] {
  const { room, furniture } = project
  const bounds = room?.bounds ?? project.dimensions
  const outline: Point2[] = room?.outline?.length
    ? room.outline
    : [
        [0, 0],
        [bounds.width, 0],
        [bounds.width, bounds.depth],
        [0, bounds.depth],
      ]
  const walls = room?.walls.map(wallBox) ?? []
  const centroid: Point2 = [
    outline.reduce((sum, point) => sum + point[0], 0) / outline.length,
    outline.reduce((sum, point) => sum + point[1], 0) / outline.length,
  ]
  const doors: Box[] = (room?.openings ?? []).flatMap((opening) => {
    const wall = room?.walls.find((entry) => entry.id === opening.wallId)
    if (opening.type !== "door" || !wall) return []
    const box = wallBox(wall)
    const mid = (opening.from + opening.to) / 2
    const center: Point2 = [
      wall.a[0] + box.x[0] * mid,
      wall.a[1] + box.x[1] * mid,
    ]
    const sign = dot(subtract(centroid, center), box.z) < 0 ? -1 : 1
    const normal: Point2 = [box.z[0] * sign, box.z[1] * sign]
    return [
      {
        center: [
          center[0] + (normal[0] * DOOR_CLEARANCE) / 2,
          center[1] + (normal[1] * DOOR_CLEARANCE) / 2,
        ],
        x: box.x,
        z: normal,
        width: Math.abs(opening.to - opening.from) / 2 + DOOR_CLEARANCE,
        depth: DOOR_CLEARANCE / 2,
      },
    ]
  })
  const boxes = furniture.map(footprint)
  return furniture.flatMap((item, index) => {
    const box = boxes[index]
    const reason = !box
      ? "가구 규격이나 위치를 확인할 수 없어요."
      : !insideRoom(outline, box)
        ? "집 경계를 벗어났어요."
        : walls.some((wall) => overlaps(box, wall))
          ? "벽과 겹쳐 있어요."
          : doors.some((door) => overlaps(box, door))
            ? "문 앞 여유 공간을 막고 있어요."
            : boxes.some(
                  (other, otherIndex) =>
                    otherIndex !== index && other && overlaps(box, other)
                )
              ? "다른 가구와 겹쳐 있어요."
              : null
    return reason ? [{ furnitureId: item.id, reason }] : []
  })
}
