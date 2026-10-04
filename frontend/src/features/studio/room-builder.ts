import type {
  Opening,
  Point2,
  RoomLabel,
  RoomModel,
  RoomSource,
  Wall,
} from "./types"

export type Corner = "nw" | "ne" | "se" | "sw"

export type Notch = { corner: Corner; width: number; depth: number }

export type RoomRect = {
  id: string
  name: string
  x: number
  z: number
  width: number
  depth: number
  notch?: Notch
}

export type RoomDraft = {
  rooms: RoomRect[]
  wallHeight: number
  source?: RoomSource
}

export const squareMetersPerPyeong = 3.3058
export const exteriorThickness = 0.2
export const interiorThickness = 0.12
export const snapDistance = 0.3
export const minRoomSize = 1
const gridStep = 0.1

type Segment = { a: Point2; b: Point2; exterior: boolean }

export function round(value: number, digits = 2) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export function snapToGrid(value: number) {
  return round(Math.round(value / gridStep) * gridStep)
}

function finite(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback
}

export function clampArea(areaPyeong: number) {
  return Math.min(Math.max(finite(areaPyeong, 20), 5), 100)
}

export function nextRoomName(draft: RoomDraft, base = "방") {
  const used = new Set(draft.rooms.map((room) => room.name))
  let index = draft.rooms.length
  let name = `${base} ${index}`
  while (used.has(name)) name = `${base} ${++index}`
  return name
}

export function pyeongToSquareMeters(pyeong: number) {
  return pyeong * squareMetersPerPyeong
}

export function draftAreaPyeong(draft: RoomDraft) {
  const area = draft.rooms.reduce((total, room) => {
    const notch = room.notch
    const cut = notch ? notch.width * notch.depth : 0
    return total + room.width * room.depth - cut
  }, 0)
  return round(area / squareMetersPerPyeong, 1)
}

export function createDraft(areaPyeong: number, name = "거실"): RoomDraft {
  const area = pyeongToSquareMeters(clampArea(areaPyeong))
  const width = snapToGrid(Math.sqrt(area * 1.4))
  const depth = snapToGrid(area / width)
  return {
    wallHeight: 2.4,
    source: { areaPyeong, roomCount: 1, preset: "blocks-v1" },
    rooms: [{ id: "room-1", name, x: 0, z: 0, width, depth }],
  }
}

export function addRoom(
  draft: RoomDraft,
  name: string,
  width = 3,
  depth = 3
): RoomDraft {
  const bounds = draftBounds(draft)
  const rect: RoomRect = {
    id: nextRoomId(draft),
    name,
    x: snapToGrid(bounds.maxX),
    z: 0,
    width: snapToGrid(width),
    depth: snapToGrid(depth),
  }
  return normalizeDraft({
    ...draft,
    rooms: [...draft.rooms, rect],
    source: draft.source && {
      ...draft.source,
      roomCount: draft.rooms.length + 1,
    },
  })
}

export function splitRoom(
  draft: RoomDraft,
  id: string,
  axis: "vertical" | "horizontal",
  at: number,
  name = "새 방"
): RoomDraft {
  const target = draft.rooms.find((room) => room.id === id)
  if (!target) return draft

  if (!Number.isFinite(at)) return draft
  const cut = snapToGrid(at)
  const first =
    axis === "vertical" ? round(cut - target.x) : round(cut - target.z)
  const second =
    axis === "vertical"
      ? round(target.x + target.width - cut)
      : round(target.z + target.depth - cut)
  if (first < minRoomSize || second < minRoomSize) return draft

  const head: RoomRect =
    axis === "vertical"
      ? { ...target, width: first, notch: undefined }
      : { ...target, depth: first, notch: undefined }
  const tail: RoomRect =
    axis === "vertical"
      ? {
          id: nextRoomId(draft),
          name,
          x: cut,
          z: target.z,
          width: second,
          depth: target.depth,
        }
      : {
          id: nextRoomId(draft),
          name,
          x: target.x,
          z: cut,
          width: target.width,
          depth: second,
        }

  const cutOut = notchArea(target)
  const corner = target.notch?.corner
  const carvedHead = cutOut && corner ? carveNotch(head, cutOut, corner) : head
  const carvedTail = cutOut && corner ? carveNotch(tail, cutOut, corner) : tail
  if (!carvedHead || !carvedTail) return draft

  const rooms = draft.rooms.flatMap((room) =>
    room.id === id ? [carvedHead, carvedTail] : [room]
  )

  return {
    ...draft,
    rooms,
    source: draft.source && { ...draft.source, roomCount: rooms.length },
  }
}

function carveNotch(
  part: RoomRect,
  cutOut: { x: number; z: number; width: number; depth: number },
  corner: Corner
): RoomRect | null {
  const epsilon = 1e-6
  const width = round(
    Math.min(part.x + part.width, cutOut.x + cutOut.width) -
      Math.max(part.x, cutOut.x)
  )
  const depth = round(
    Math.min(part.z + part.depth, cutOut.z + cutOut.depth) -
      Math.max(part.z, cutOut.z)
  )
  if (width <= epsilon || depth <= epsilon) return { ...part, notch: undefined }

  const wholeWidth = width >= part.width - epsilon
  const wholeDepth = depth >= part.depth - epsilon
  if (wholeWidth && wholeDepth) return null

  if (wholeWidth) {
    const rest = round(part.depth - depth)
    if (rest < minRoomSize) return null
    const fromTop = corner === "nw" || corner === "ne"
    return {
      ...part,
      notch: undefined,
      depth: rest,
      z: fromTop ? round(part.z + depth) : part.z,
    }
  }

  if (wholeDepth) {
    const rest = round(part.width - width)
    if (rest < minRoomSize) return null
    const fromLeft = corner === "nw" || corner === "sw"
    return {
      ...part,
      notch: undefined,
      width: rest,
      x: fromLeft ? round(part.x + width) : part.x,
    }
  }

  return { ...part, notch: { corner, width, depth } }
}

export function splitSpan(
  room: RoomRect,
  axis: "vertical" | "horizontal",
  cut: number
): [number, number] | null {
  const from = axis === "vertical" ? room.z : room.x
  const to = axis === "vertical" ? room.z + room.depth : room.x + room.width
  const cutOut = notchArea(room)
  if (!cutOut) return [from, to]

  const across =
    axis === "vertical"
      ? cut > cutOut.x && cut < cutOut.x + cutOut.width
      : cut > cutOut.z && cut < cutOut.z + cutOut.depth
  if (!across) return [from, to]

  const corner = room.notch!.corner
  const leading =
    axis === "vertical"
      ? corner === "nw" || corner === "ne"
      : corner === "nw" || corner === "sw"
  const span: [number, number] = leading
    ? [round(from + (axis === "vertical" ? cutOut.depth : cutOut.width)), to]
    : [from, round(to - (axis === "vertical" ? cutOut.depth : cutOut.width))]
  return span[1] - span[0] > 0 ? span : null
}

function fitNotch(room: RoomRect, notch: Notch | undefined): RoomRect {
  if (!notch) return { ...room, notch: undefined }
  const width = Math.min(notch.width, round(room.width - minRoomSize / 2))
  const depth = Math.min(notch.depth, round(room.depth - minRoomSize / 2))
  if (width <= 0 || depth <= 0) return { ...room, notch: undefined }
  return { ...room, notch: { corner: notch.corner, width, depth } }
}

function nextRoomId(draft: RoomDraft) {
  const used = draft.rooms.map((room) => {
    const match = /^room-(\d+)$/.exec(room.id)
    return match ? Number(match[1]) : 0
  })
  return `room-${Math.max(0, ...used) + 1}`
}

export function mergeRooms(
  draft: RoomDraft,
  first: string,
  second: string
): RoomDraft {
  if (first === second) return draft
  const left = draft.rooms.find((room) => room.id === first)
  const right = draft.rooms.find((room) => room.id === second)
  if (!left || !right || left.notch || right.notch) return draft

  const epsilon = 1e-6
  const sameRow =
    Math.abs(left.z - right.z) < epsilon &&
    Math.abs(left.depth - right.depth) < epsilon &&
    (Math.abs(left.x + left.width - right.x) < epsilon ||
      Math.abs(right.x + right.width - left.x) < epsilon)
  const sameColumn =
    Math.abs(left.x - right.x) < epsilon &&
    Math.abs(left.width - right.width) < epsilon &&
    (Math.abs(left.z + left.depth - right.z) < epsilon ||
      Math.abs(right.z + right.depth - left.z) < epsilon)
  if (!sameRow && !sameColumn) return draft

  const merged: RoomRect = {
    ...left,
    x: round(Math.min(left.x, right.x)),
    z: round(Math.min(left.z, right.z)),
    width: sameRow ? round(left.width + right.width) : left.width,
    depth: sameColumn ? round(left.depth + right.depth) : left.depth,
  }

  const rooms = draft.rooms
    .filter((room) => room.id !== second)
    .map((room) => (room.id === first ? merged : room))

  return normalizeDraft({
    ...draft,
    rooms,
    source: draft.source && { ...draft.source, roomCount: rooms.length },
  })
}

export function roomsAcrossWall(
  draft: RoomDraft,
  wall: Wall
): [string, string] | null {
  const epsilon = 1e-6
  const vertical = Math.abs(wall.a[0] - wall.b[0]) < epsilon
  const line = vertical ? wall.a[0] : wall.a[1]
  const from = vertical
    ? Math.min(wall.a[1], wall.b[1])
    : Math.min(wall.a[0], wall.b[0])
  const to = vertical
    ? Math.max(wall.a[1], wall.b[1])
    : Math.max(wall.a[0], wall.b[0])

  const rooms = normalize(draft)
  const touching = (room: RoomRect, side: "before" | "after") => {
    const edge = vertical
      ? side === "before"
        ? room.x + room.width
        : room.x
      : side === "before"
        ? room.z + room.depth
        : room.z
    if (Math.abs(edge - line) > epsilon) return false
    const start = vertical ? room.z : room.x
    const end = vertical ? room.z + room.depth : room.x + room.width
    return Math.min(end, to) - Math.max(start, from) > epsilon
  }

  const before = rooms.find((room) => touching(room, "before"))
  const after = rooms.find((room) => touching(room, "after"))
  if (!before || !after || before.id === after.id) return null
  return [before.id, after.id]
}

export function fitToArea(
  draft: RoomDraft,
  areaPyeong: number,
  openings: Opening[] = [],
  walls: Wall[] = []
): { draft: RoomDraft; openings: Opening[] } {
  const rooms = normalize(draft)
  const current = rooms.reduce(
    (total, room) =>
      total +
      room.width * room.depth -
      (room.notch ? room.notch.width * room.notch.depth : 0),
    0
  )
  if (!rooms.length || current <= 0) return { draft, openings }

  const factor = Math.sqrt(
    pyeongToSquareMeters(clampArea(areaPyeong)) / current
  )
  const scale = (value: number) => snapToGrid(value * factor)

  const fitted = rooms.map((room): RoomRect => {
    const x = scale(room.x)
    const z = scale(room.z)
    const width = Math.max(minRoomSize, round(scale(room.x + room.width) - x))
    const depth = Math.max(minRoomSize, round(scale(room.z + room.depth) - z))
    if (!room.notch) return { ...room, x, z, width, depth }
    return {
      ...room,
      x,
      z,
      width,
      depth,
      notch: {
        corner: room.notch.corner,
        width: Math.min(
          Math.max(scale(room.notch.width), 0.5),
          round(width - 0.5)
        ),
        depth: Math.min(
          Math.max(scale(room.notch.depth), 0.5),
          round(depth - 0.5)
        ),
      },
    }
  })

  const byId = new Map(walls.map((wall) => [wall.id, wall]))
  const moved = openings.flatMap((opening) => {
    const wall = byId.get(opening.wallId)
    if (!wall) return []
    const a: Point2 = [scale(wall.a[0]), scale(wall.a[1])]
    const b: Point2 = [scale(wall.b[0]), scale(wall.b[1])]
    const length = Math.hypot(b[0] - a[0], b[1] - a[1])
    const size = opening.to - opening.from
    const center = ((opening.from + opening.to) / 2) * factor
    const from = round(
      Math.min(Math.max(center - size / 2, 0), Math.max(length - size, 0))
    )
    return [
      {
        ...opening,
        wallId: wallId({ a, b, exterior: false }),
        from,
        to: round(Math.min(from + size, length)),
      },
    ]
  })

  return {
    draft: normalizeDraft({
      ...draft,
      rooms: fitted,
      source: draft.source && {
        ...draft.source,
        areaPyeong: clampArea(areaPyeong),
      },
    }),
    openings: moved,
  }
}

export function removeRoom(draft: RoomDraft, id: string): RoomDraft {
  const rooms = draft.rooms.filter((room) => room.id !== id)
  if (!rooms.length) return draft
  return normalizeDraft({
    ...draft,
    rooms,
    source: draft.source && { ...draft.source, roomCount: rooms.length },
  })
}

export function moveRoom(
  draft: RoomDraft,
  id: string,
  x: number,
  z: number
): RoomDraft {
  const target = draft.rooms.find((room) => room.id === id)
  if (!target) return draft
  if (!Number.isFinite(x) || !Number.isFinite(z)) return draft
  const others = draft.rooms.filter((room) => room.id !== id)
  const moved = snapRect(
    clampToCluster({ ...target, x: snapToGrid(x), z: snapToGrid(z) }, others),
    others
  )
  if (moved.x === target.x && moved.z === target.z) return draft
  return normalizeDraft({
    ...draft,
    rooms: draft.rooms.map((room) => (room.id === id ? moved : room)),
  })
}

export function resizeRoom(
  draft: RoomDraft,
  id: string,
  width: number,
  depth: number
): RoomDraft {
  const target = draft.rooms.find((room) => room.id === id)
  if (!target) return draft

  const nextWidth = Math.max(
    minRoomSize,
    snapToGrid(finite(width, target.width))
  )
  const nextDepth = Math.max(
    minRoomSize,
    snapToGrid(finite(depth, target.depth))
  )
  const shiftX = round(nextWidth - target.width)
  const shiftZ = round(nextDepth - target.depth)
  const right = round(target.x + target.width)
  const bottom = round(target.z + target.depth)
  const epsilon = 1e-6

  const rooms = draft.rooms.map((room) => {
    if (room.id === id) {
      return fitNotch(
        { ...room, width: nextWidth, depth: nextDepth },
        room.notch
      )
    }
    return {
      ...room,
      x: room.x > right - epsilon ? round(room.x + shiftX) : room.x,
      z: room.z > bottom - epsilon ? round(room.z + shiftZ) : room.z,
    }
  })

  return normalizeDraft({ ...draft, rooms })
}

function clampToCluster(rect: RoomRect, others: RoomRect[]): RoomRect {
  if (!others.length) return rect
  const minX = Math.min(...others.map((room) => room.x))
  const minZ = Math.min(...others.map((room) => room.z))
  const maxX = Math.max(...others.map((room) => room.x + room.width))
  const maxZ = Math.max(...others.map((room) => room.z + room.depth))
  return {
    ...rect,
    x: round(Math.min(Math.max(rect.x, minX - rect.width), maxX)),
    z: round(Math.min(Math.max(rect.z, minZ - rect.depth), maxZ)),
  }
}

function snapRect(rect: RoomRect, others: RoomRect[]): RoomRect {
  let x = rect.x
  let z = rect.z
  let bestX = snapDistance
  let bestZ = snapDistance

  for (const other of others) {
    for (const [from, to] of [
      [rect.x, other.x + other.width],
      [rect.x, other.x],
      [rect.x + rect.width, other.x],
      [rect.x + rect.width, other.x + other.width],
    ]) {
      const distance = Math.abs(from - to)
      if (distance < bestX) {
        bestX = distance
        x = round(rect.x + (to - from))
      }
    }
    for (const [from, to] of [
      [rect.z, other.z + other.depth],
      [rect.z, other.z],
      [rect.z + rect.depth, other.z],
      [rect.z + rect.depth, other.z + other.depth],
    ]) {
      const distance = Math.abs(from - to)
      if (distance < bestZ) {
        bestZ = distance
        z = round(rect.z + (to - from))
      }
    }
  }

  return { ...rect, x, z }
}

function draftBounds(draft: RoomDraft) {
  const minX = Math.min(...draft.rooms.map((room) => room.x))
  const minZ = Math.min(...draft.rooms.map((room) => room.z))
  const maxX = Math.max(...draft.rooms.map((room) => room.x + room.width))
  const maxZ = Math.max(...draft.rooms.map((room) => room.z + room.depth))
  return { minX, minZ, maxX, maxZ }
}

function normalize(draft: RoomDraft): RoomRect[] {
  const bounds = draftBounds(draft)
  return draft.rooms.map((room) => ({
    ...room,
    x: round(room.x - bounds.minX),
    z: round(room.z - bounds.minZ),
  }))
}

export function normalizeDraft(draft: RoomDraft): RoomDraft {
  return { ...draft, rooms: normalize(draft) }
}

function axisValues(rooms: RoomRect[], axis: "x" | "z") {
  const index = axis === "x" ? 0 : 1
  const values = new Set<number>()
  for (const room of rooms) {
    for (const point of roomPolygon(room)) values.add(round(point[index]))
  }
  return [...values].sort((left, right) => left - right)
}

function notchArea(room: RoomRect) {
  if (!room.notch) return null
  const { corner, width, depth } = room.notch
  const x =
    corner === "ne" || corner === "se" ? room.x + room.width - width : room.x
  const z =
    corner === "se" || corner === "sw" ? room.z + room.depth - depth : room.z
  return { x, z, width, depth }
}

function covers(room: RoomRect, x: number, z: number) {
  const inside =
    x > room.x &&
    x < room.x + room.width &&
    z > room.z &&
    z < room.z + room.depth
  if (!inside) return false
  const notch = notchArea(room)
  if (!notch) return true
  const inNotch =
    x > notch.x &&
    x < notch.x + notch.width &&
    z > notch.z &&
    z < notch.z + notch.depth
  return !inNotch
}

function roomAtCell(rooms: RoomRect[], x: number, z: number) {
  return rooms.find((room) => covers(room, x, z))
}

export function roomPolygon(room: RoomRect): Point2[] {
  const { x, z, width: w, depth: d } = room
  const notch = room.notch
  if (!notch) {
    return [
      [x, z],
      [x + w, z],
      [x + w, z + d],
      [x, z + d],
    ]
  }
  const nw = notch.width
  const nd = notch.depth
  if (notch.corner === "ne") {
    return [
      [x, z],
      [x + w - nw, z],
      [x + w - nw, z + nd],
      [x + w, z + nd],
      [x + w, z + d],
      [x, z + d],
    ]
  }
  if (notch.corner === "nw") {
    return [
      [x + nw, z],
      [x + w, z],
      [x + w, z + d],
      [x, z + d],
      [x, z + nd],
      [x + nw, z + nd],
    ]
  }
  if (notch.corner === "se") {
    return [
      [x, z],
      [x + w, z],
      [x + w, z + d - nd],
      [x + w - nw, z + d - nd],
      [x + w - nw, z + d],
      [x, z + d],
    ]
  }
  return [
    [x, z],
    [x + w, z],
    [x + w, z + d],
    [x + nw, z + d],
    [x + nw, z + d - nd],
    [x, z + d - nd],
  ]
}

export function labelPoint(polygon: Point2[]): Point2 {
  const xs = [...new Set(polygon.map((point) => point[0]))].sort(
    (left, right) => left - right
  )
  const zs = [...new Set(polygon.map((point) => point[1]))].sort(
    (left, right) => left - right
  )
  let best: { area: number; point: Point2 } | null = null

  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < zs.length - 1; j++) {
      const x = (xs[i] + xs[i + 1]) / 2
      const z = (zs[j] + zs[j + 1]) / 2
      if (!isInside(polygon, x, z)) continue
      const area = (xs[i + 1] - xs[i]) * (zs[j + 1] - zs[j])
      if (!best || area > best.area)
        best = { area, point: [round(x), round(z)] }
    }
  }
  if (best) return best.point

  const sum = polygon.reduce(
    (total, point) => [total[0] + point[0], total[1] + point[1]] as Point2,
    [0, 0] as Point2
  )
  return [round(sum[0] / polygon.length), round(sum[1] / polygon.length)]
}

function isInside(polygon: Point2[], x: number, z: number) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i]
    const [xj, zj] = polygon[j]
    const crosses =
      zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi
    if (crosses) inside = !inside
  }
  return inside
}

export function setNotch(
  draft: RoomDraft,
  id: string,
  notch: Notch | undefined
): RoomDraft {
  return {
    ...draft,
    rooms: draft.rooms.map((room) => {
      if (room.id !== id) return room
      if (!notch) return { ...room, notch: undefined }
      return {
        ...room,
        notch: {
          corner: notch.corner,
          width: Math.min(
            Math.max(snapToGrid(finite(notch.width, 0.5)), 0.5),
            round(room.width - 0.5)
          ),
          depth: Math.min(
            Math.max(snapToGrid(finite(notch.depth, 0.5)), 0.5),
            round(room.depth - 0.5)
          ),
        },
      }
    }),
  }
}

function polygonArea(points: Point2[]) {
  let area = 0
  for (let index = 0; index < points.length; index++) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    area += current[0] * next[1] - next[0] * current[1]
  }
  return Math.abs(area) / 2
}

function traceLoops(segments: Segment[]): Point2[][] {
  const key = (point: Point2) => `${point[0]},${point[1]}`
  const starts = new Map<string, Segment[]>()
  for (const segment of segments) {
    const list = starts.get(key(segment.a)) ?? []
    list.push(segment)
    starts.set(key(segment.a), list)
  }

  const used = new Set<Segment>()
  const loops: Point2[][] = []

  for (const segment of segments) {
    if (used.has(segment)) continue
    const loop: Point2[] = [segment.a]
    let current = segment
    used.add(segment)
    while (true) {
      const candidates = starts.get(key(current.b)) ?? []
      const next = candidates.find((item) => !used.has(item))
      if (!next) break
      used.add(next)
      loop.push(next.a)
      current = next
      if (key(next.b) === key(segment.a)) break
    }
    if (loop.length >= 4) loops.push(mergeCollinear(loop))
  }

  return loops
}

function largestLoop(segments: Segment[]): Point2[] {
  const loops = traceLoops(segments)
  if (!loops.length) return []
  return loops.reduce((largest, loop) =>
    polygonArea(loop) > polygonArea(largest) ? loop : largest
  )
}

function mergeCollinear(points: Point2[]): Point2[] {
  const merged: Point2[] = []
  for (let index = 0; index < points.length; index++) {
    const previous = points[(index - 1 + points.length) % points.length]
    const current = points[index]
    const next = points[(index + 1) % points.length]
    const cross =
      (current[0] - previous[0]) * (next[1] - current[1]) -
      (current[1] - previous[1]) * (next[0] - current[0])
    if (Math.abs(cross) > 1e-9) merged.push(current)
  }
  return merged.length >= 3 ? merged : points
}

function mergeSegments(segments: Segment[]): Segment[] {
  const merged: Segment[] = []
  const horizontal = segments.filter((segment) => segment.a[1] === segment.b[1])
  const vertical = segments.filter((segment) => segment.a[0] === segment.b[0])

  for (const [group, fixedAxis, movingAxis] of [
    [horizontal, 1, 0],
    [vertical, 0, 1],
  ] as const) {
    const lines = new Map<string, Segment[]>()
    for (const segment of group) {
      const lineKey = `${segment.a[fixedAxis]}:${segment.exterior}`
      const list = lines.get(lineKey) ?? []
      list.push(segment)
      lines.set(lineKey, list)
    }
    for (const list of lines.values()) {
      const sorted = [...list].sort(
        (left, right) =>
          Math.min(left.a[movingAxis], left.b[movingAxis]) -
          Math.min(right.a[movingAxis], right.b[movingAxis])
      )
      let open: Segment | null = null
      for (const segment of sorted) {
        const start = Math.min(segment.a[movingAxis], segment.b[movingAxis])
        const end = Math.max(segment.a[movingAxis], segment.b[movingAxis])
        if (
          open &&
          Math.max(open.a[movingAxis], open.b[movingAxis]) === start
        ) {
          const openStart = Math.min(open.a[movingAxis], open.b[movingAxis])
          const a: Point2 = [...open.a]
          const b: Point2 = [...open.b]
          a[movingAxis] = openStart
          b[movingAxis] = end
          open = { a, b, exterior: open.exterior }
        } else {
          if (open) merged.push(open)
          open = segment
        }
      }
      if (open) merged.push(open)
    }
  }
  return merged
}

function wallId(segment: Segment) {
  return `w-${segment.a[0]}-${segment.a[1]}-${segment.b[0]}-${segment.b[1]}`
}

function wallLength(wall: Wall) {
  return Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1])
}

export function buildRoomModel(
  draft: RoomDraft,
  openings: Opening[] = []
): RoomModel {
  const rooms = normalize(draft)
  const xs = axisValues(rooms, "x")
  const zs = axisValues(rooms, "z")
  const outlineSegments: Segment[] = []
  const interiorSegments: Segment[] = []

  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < zs.length - 1; j++) {
      const x0 = xs[i]
      const x1 = xs[i + 1]
      const z0 = zs[j]
      const z1 = zs[j + 1]
      const owner = roomAtCell(rooms, (x0 + x1) / 2, (z0 + z1) / 2)
      if (!owner) continue

      const neighbors = [
        {
          owner: roomAtCell(rooms, (x0 + x1) / 2, z0 - gridStep / 2),
          a: [x0, z0],
          b: [x1, z0],
        },
        {
          owner: roomAtCell(rooms, x1 + gridStep / 2, (z0 + z1) / 2),
          a: [x1, z0],
          b: [x1, z1],
        },
        {
          owner: roomAtCell(rooms, (x0 + x1) / 2, z1 + gridStep / 2),
          a: [x1, z1],
          b: [x0, z1],
        },
        {
          owner: roomAtCell(rooms, x0 - gridStep / 2, (z0 + z1) / 2),
          a: [x0, z1],
          b: [x0, z0],
        },
      ] as const

      for (const neighbor of neighbors) {
        const segment: Segment = {
          a: [neighbor.a[0], neighbor.a[1]],
          b: [neighbor.b[0], neighbor.b[1]],
          exterior: !neighbor.owner,
        }
        if (!neighbor.owner) outlineSegments.push(segment)
        else if (neighbor.owner.id !== owner.id) interiorSegments.push(segment)
      }
    }
  }

  const outline = largestLoop(outlineSegments)
  const openingWalls = new Set(openings.map((opening) => opening.wallId))
  const walls: Wall[] = mergeSegments([
    ...outlineSegments,
    ...dedupe(interiorSegments),
  ]).map((segment) => {
    const reverse = { ...segment, a: segment.b, b: segment.a }
    // Collinear merging may reverse an unchanged wall. Keep the orientation
    // referenced by existing openings so both distances and door hinges survive.
    const oriented =
      !openingWalls.has(wallId(segment)) && openingWalls.has(wallId(reverse))
        ? reverse
        : segment
    return {
      id: wallId(oriented),
      a: oriented.a,
      b: oriented.b,
      thickness: oriented.exterior ? exteriorThickness : interiorThickness,
    }
  })

  const labels: RoomLabel[] = rooms.map((room) => ({
    name: room.name,
    polygon: roomPolygon(room),
  }))

  const bounds = {
    width: round(Math.max(...rooms.map((room) => room.x + room.width))),
    depth: round(Math.max(...rooms.map((room) => room.z + room.depth))),
  }
  const firstRoom = rooms[0]

  return {
    version: 2,
    unit: "m",
    wallHeight: draft.wallHeight,
    bounds,
    outline,
    walls,
    openings: keepOpenings(openings, walls),
    rooms: labels,
    spawn: labelPoint(roomPolygon(firstRoom)),
    source: draft.source,
  }
}

function dedupe(segments: Segment[]): Segment[] {
  const seen = new Set<string>()
  const unique: Segment[] = []
  for (const segment of segments) {
    const points = [segment.a, segment.b]
      .map((point) => `${point[0]},${point[1]}`)
      .sort()
      .join("|")
    if (seen.has(points)) continue
    seen.add(points)
    unique.push(segment)
  }
  return unique
}

function keepOpenings(openings: Opening[], walls: Wall[]): Opening[] {
  const byId = new Map(walls.map((wall) => [wall.id, wall]))
  return openings.filter((opening) => {
    const wall = byId.get(opening.wallId)
    return wall !== undefined && opening.to <= wallLength(wall)
  })
}

export function addOpening(
  model: RoomModel,
  wallId: string,
  type: Opening["type"],
  center: number,
  width = type === "door" ? 0.9 : 1.5
): RoomModel {
  const wall = model.walls.find((item) => item.id === wallId)
  if (!wall) return model
  const length = wallLength(wall)
  const half = width / 2
  const from = round(
    Math.min(Math.max(center - half, 0), Math.max(length - width, 0))
  )
  const to = round(Math.min(from + width, length))
  if (to - from < 0.3) return model

  const used = new Set(model.openings.map((item) => item.id))
  let index = model.openings.length + 1
  while (used.has(`${type}-${index}-${wallId}`)) index++

  const opening: Opening = {
    id: `${type}-${index}-${wallId}`,
    wallId,
    type,
    from,
    to,
    bottom: type === "door" ? 0 : 0.9,
    top: type === "door" ? 2.1 : 2.1,
  }
  if (model.openings.some((item) => overlaps(item, opening))) return model
  return { ...model, openings: [...model.openings, opening] }
}

export function removeOpening(model: RoomModel, openingId: string): RoomModel {
  return {
    ...model,
    openings: model.openings.filter((opening) => opening.id !== openingId),
  }
}

function overlaps(left: Opening, right: Opening) {
  return (
    left.wallId === right.wallId && left.from < right.to && right.from < left.to
  )
}

function notchFromPolygon(
  polygon: Point2[],
  x: number,
  z: number,
  width: number,
  depth: number
): Notch | undefined {
  if (polygon.length !== 6) return undefined
  const has = (point: Point2) =>
    polygon.some(
      (item) =>
        Math.abs(item[0] - point[0]) < 1e-6 &&
        Math.abs(item[1] - point[1]) < 1e-6
    )
  const corners: { corner: Corner; point: Point2 }[] = [
    { corner: "nw", point: [x, z] },
    { corner: "ne", point: [x + width, z] },
    { corner: "se", point: [x + width, z + depth] },
    { corner: "sw", point: [x, z + depth] },
  ]
  const missing = corners.find((item) => !has(item.point))
  if (!missing) return undefined
  const inner = polygon.find(
    (point) =>
      point[0] > x + 1e-6 &&
      point[0] < x + width - 1e-6 &&
      point[1] > z + 1e-6 &&
      point[1] < z + depth - 1e-6
  )
  if (!inner) return undefined
  return {
    corner: missing.corner,
    width: round(
      missing.corner === "ne" || missing.corner === "se"
        ? x + width - inner[0]
        : inner[0] - x
    ),
    depth: round(
      missing.corner === "se" || missing.corner === "sw"
        ? z + depth - inner[1]
        : inner[1] - z
    ),
  }
}

export function hasOverlap(draft: RoomDraft): boolean {
  const rooms = normalize(draft)
  const xs = axisValues(rooms, "x")
  const zs = axisValues(rooms, "z")

  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < zs.length - 1; j++) {
      const x = (xs[i] + xs[i + 1]) / 2
      const z = (zs[j] + zs[j + 1]) / 2
      const owners = rooms.filter((room) => covers(room, x, z))
      if (owners.length > 1) return true
    }
  }
  return false
}

export function isConnected(draft: RoomDraft): boolean {
  if (draft.rooms.length <= 1) return true
  const epsilon = 1e-6
  const touching = (left: RoomRect, right: RoomRect) => {
    const overlapX =
      Math.min(left.x + left.width, right.x + right.width) -
      Math.max(left.x, right.x)
    const overlapZ =
      Math.min(left.z + left.depth, right.z + right.depth) -
      Math.max(left.z, right.z)
    if (overlapX < -epsilon || overlapZ < -epsilon) return false
    return overlapX > epsilon || overlapZ > epsilon
  }

  const visited = new Set([draft.rooms[0].id])
  const queue = [draft.rooms[0]]
  while (queue.length) {
    const current = queue.shift()!
    for (const room of draft.rooms) {
      if (visited.has(room.id) || !touching(current, room)) continue
      visited.add(room.id)
      queue.push(room)
    }
  }
  return visited.size === draft.rooms.length
}

export function draftFromModel(model: RoomModel): RoomDraft {
  const rooms: RoomRect[] = model.rooms.map((room, index) => {
    const xs = room.polygon.map((point) => point[0])
    const zs = room.polygon.map((point) => point[1])
    const x = round(Math.min(...xs))
    const z = round(Math.min(...zs))
    const width = round(Math.max(...xs) - x)
    const depth = round(Math.max(...zs) - z)
    return {
      id: `room-${index + 1}`,
      name: room.name,
      x,
      z,
      width,
      depth,
      notch: notchFromPolygon(room.polygon, x, z, width, depth),
    }
  })
  return {
    rooms: rooms.length
      ? rooms
      : [
          {
            id: "room-1",
            name: "거실",
            x: 0,
            z: 0,
            width: model.bounds.width,
            depth: model.bounds.depth,
          },
        ],
    wallHeight: model.wallHeight,
    source: model.source,
  }
}

export function renameRoom(
  draft: RoomDraft,
  id: string,
  name: string
): RoomDraft {
  return {
    ...draft,
    rooms: draft.rooms.map((room) =>
      room.id === id ? { ...room, name } : room
    ),
  }
}
