import {
  buildRoomModel,
  minRoomSize,
  roomPolygon,
  round,
  snapToGrid,
  type RoomDraft,
  type RoomRect,
} from "./room-builder"
import type { Opening, Point2, RoomModel, Wall } from "./types"

export type ResizeHandle = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw"
export type OpeningHandle = "move" | "from" | "to"
export type StructureState = { draft: RoomDraft; openings: Opening[] }
export const minOpeningWidth = 0.3
export const maxRoomSize = 40

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))
export const wallLength = (wall: Wall) =>
  Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1])
export function alongWall(wall: Wall, point: Point2) {
  return (
    ((point[0] - wall.a[0]) * (wall.b[0] - wall.a[0]) +
      (point[1] - wall.a[1]) * (wall.b[1] - wall.a[1])) /
    wallLength(wall)
  )
}
export function draftOrigin(draft: RoomDraft): Point2 {
  return [
    Math.min(...draft.rooms.map((room) => room.x)),
    Math.min(...draft.rooms.map((room) => room.z)),
  ]
}

/** Keep the opposite edge in world coordinates. Normalize only when the gesture commits. */
export function resizeRect(
  room: RoomRect,
  handle: ResizeHandle,
  dx: number,
  dz: number
): RoomRect {
  if (!Number.isFinite(dx) || !Number.isFinite(dz)) return room
  const width =
    handle.includes("e") || handle.includes("w")
      ? clamp(
          snapToGrid(room.width + (handle.includes("w") ? -dx : dx)),
          minRoomSize,
          maxRoomSize
        )
      : room.width
  const depth =
    handle.includes("n") || handle.includes("s")
      ? clamp(
          snapToGrid(room.depth + (handle.includes("n") ? -dz : dz)),
          minRoomSize,
          maxRoomSize
        )
      : room.depth
  if (width === room.width && depth === room.depth) return room
  return {
    ...room,
    width,
    depth,
    x: handle.includes("w") ? round(room.x + room.width - width) : room.x,
    z: handle.includes("n") ? round(room.z + room.depth - depth) : room.z,
    notch: room.notch && {
      ...room.notch,
      width: Math.min(room.notch.width, round(width - 0.5)),
      depth: Math.min(room.notch.depth, round(depth - 0.5)),
    },
  }
}

export function openingLimits(model: RoomModel, id: string) {
  const opening = model.openings.find((item) => item.id === id)
  const wall = model.walls.find((item) => item.id === opening?.wallId)
  if (!opening || !wall) return null
  const others = model.openings.filter(
    (item) => item.id !== id && item.wallId === wall.id
  )
  return {
    min: Math.max(
      0,
      ...others.filter((item) => item.to <= opening.from).map((item) => item.to)
    ),
    max: Math.min(
      wallLength(wall),
      ...others
        .filter((item) => item.from >= opening.to)
        .map((item) => item.from)
    ),
  }
}

/** Delta is measured along the wall, including walls whose endpoints run backwards. */
export function adjustOpening(
  model: RoomModel,
  id: string,
  handle: OpeningHandle,
  delta: number,
  snap = true
): Opening[] {
  const opening = model.openings.find((item) => item.id === id)
  const limits = openingLimits(model, id)
  if (!opening || !limits || !Number.isFinite(delta)) return model.openings
  if (snap) delta = snapToGrid(delta)
  if (delta === 0) return model.openings
  let { from, to } = opening
  if (handle === "move") {
    from = clamp(opening.from + delta, limits.min, limits.max - (to - from))
    to = from + opening.to - opening.from
  } else if (handle === "from") {
    from = clamp(from + delta, limits.min, to - minOpeningWidth)
  } else {
    to = clamp(to + delta, from + minOpeningWidth, limits.max)
  }
  from = round(from)
  to = round(to)
  if (from === opening.from && to === opening.to) return model.openings
  return model.openings.map((item) =>
    item.id === id ? { ...item, from, to } : item
  )
}

const near = (a: number, b: number) => Math.abs(a - b) < 1e-6
function containsPoint(a: Point2, b: Point2, point: Point2) {
  return (
    near(
      (b[0] - a[0]) * (point[1] - a[1]),
      (b[1] - a[1]) * (point[0] - a[0])
    ) &&
    point.every(
      (value, axis) =>
        value >= Math.min(a[axis], b[axis]) - 1e-6 &&
        value <= Math.max(a[axis], b[axis]) + 1e-6
    )
  )
}

/** Preserve physical widths. Ambiguous topology or a wall too short refuses the resize. */
export function resizeStructure(
  state: StructureState,
  id: string,
  handle: ResizeHandle,
  dx: number,
  dz: number
): { state: StructureState; error?: string } {
  const target = state.draft.rooms.find((room) => room.id === id)
  if (!target) return { state }
  const resized = resizeRect(target, handle, dx, dz)
  if (resized === target) return { state }
  const draft = {
    ...state.draft,
    rooms: state.draft.rooms.map((room) => (room.id === id ? resized : room)),
  }
  const before = buildRoomModel(state.draft, state.openings)
  const after = buildRoomModel(draft)
  const oldOrigin = draftOrigin(state.draft)
  const newOrigin = draftOrigin(draft)
  const openings: Opening[] = []
  const failure = {
    state,
    error:
      "문이나 창문을 보존할 수 없는 크기예요. 위치나 폭을 먼저 조절해 주세요.",
  }
  for (const opening of before.openings) {
    const old = before.walls.find((wall) => wall.id === opening.wallId)!
    const world: Wall = {
      ...old,
      a: [old.a[0] + oldOrigin[0], old.a[1] + oldOrigin[1]],
      b: [old.b[0] + oldOrigin[0], old.b[1] + oldOrigin[1]],
    }
    const centerRatio = (opening.from + opening.to) / 2 / wallLength(old)
    let center: Point2 = [
      world.a[0] + (world.b[0] - world.a[0]) * centerRatio,
      world.a[1] + (world.b[1] - world.a[1]) * centerRatio,
    ]
    const polygon = roomPolygon(target)
    const edge = polygon.findIndex((a, index) =>
      containsPoint(a, polygon[(index + 1) % polygon.length], center)
    )
    if (edge !== -1) {
      const a = polygon[edge]
      const b = polygon[(edge + 1) % polygon.length]
      const ratio =
        Math.hypot(center[0] - a[0], center[1] - a[1]) /
        Math.hypot(b[0] - a[0], b[1] - a[1])
      const nextPolygon = roomPolygon(resized)
      const nextA = nextPolygon[edge]
      const nextB = nextPolygon[(edge + 1) % polygon.length]
      center = [
        nextA[0] + (nextB[0] - nextA[0]) * ratio,
        nextA[1] + (nextB[1] - nextA[1]) * ratio,
      ]
    }
    center = [center[0] - newOrigin[0], center[1] - newOrigin[1]]
    const horizontal = near(world.a[1], world.b[1])
    const candidates = after.walls.filter(
      (wall) =>
        containsPoint(wall.a, wall.b, center) &&
        horizontal === near(wall.a[1], wall.b[1])
    )
    if (candidates.length !== 1) return failure
    const wall = candidates[0]
    const width = round(opening.to - opening.from)
    if (wallLength(wall) < width) return failure
    const from = round(
      clamp(alongWall(wall, center) - width / 2, 0, wallLength(wall) - width)
    )
    const next = { ...opening, wallId: wall.id, from, to: round(from + width) }
    if (
      openings.some(
        (item) =>
          item.wallId === next.wallId &&
          item.from < next.to &&
          next.from < item.to
      )
    )
      return failure
    openings.push(next)
  }
  return { state: { draft, openings } }
}
