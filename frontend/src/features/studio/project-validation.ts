import type { Furniture, Point2, Project, RoomModel } from "./types"
import {
  assertFurnitureCount,
  maxFurnitureCount,
  projectNameError,
} from "./input-limits"

// This is the browser persistence boundary, not collision or full polygon validation.
export const maxStoredProjectLength = 1024 * 1024

function check(valid: unknown): asserts valid {
  if (!valid)
    throw new Error("저장할 프로젝트의 형식이나 허용 범위를 확인해 주세요.")
}
function record(value: unknown): Record<string, unknown> {
  check(value && typeof value === "object" && !Array.isArray(value))
  return value as Record<string, unknown>
}
function text(value: unknown, max: number, empty = false): string {
  check(
    typeof value === "string" &&
      value.length <= max &&
      (empty || value.trim().length > 0)
  )
  return value
}
function projectName(value: unknown): string {
  check(typeof value === "string" && projectNameError(value) === null)
  return value
}
function number(
  value: unknown,
  min = -Number.MAX_SAFE_INTEGER,
  max = Number.MAX_SAFE_INTEGER
): number {
  check(
    typeof value === "number" &&
      Number.isFinite(value) &&
      value >= min &&
      value <= max
  )
  return value
}
function list(value: unknown, max: number, min = 0): unknown[] {
  check(Array.isArray(value) && value.length >= min && value.length <= max)
  return value
}
function choice<T extends string>(value: unknown, allowed: readonly T[]): T {
  check(typeof value === "string" && allowed.includes(value as T))
  return value as T
}
function id(value: unknown, seen?: Set<string>): string {
  const result = text(value, 128)
  check(
    !["__proto__", "constructor", "prototype"].includes(result) &&
      !seen?.has(result)
  )
  seen?.add(result)
  return result
}
function date(value: unknown): string {
  const result = text(value, 64)
  check(Number.isFinite(Date.parse(result)))
  return result
}
function point(
  value: unknown,
  bounds: { width: number; depth: number }
): Point2 {
  const coordinates = list(value, 2, 2)
  return [
    number(coordinates[0], 0, bounds.width),
    number(coordinates[1], 0, bounds.depth),
  ]
}
function polygon(
  value: unknown,
  bounds: { width: number; depth: number }
): Point2[] {
  const points = list(value, 512, 3).map((value) => point(value, bounds))
  // Avoid zero-length edges and zero-area shapes before passing them to Three.
  let area = 0
  points.forEach((a, index) => {
    const b = points[(index + 1) % points.length]
    check(Math.hypot(a[0] - b[0], a[1] - b[1]) > 1e-8)
    area += a[0] * b[1] - b[0] * a[1]
  })
  check(Math.abs(area) > 1e-8)
  return points
}
function room(value: unknown): RoomModel {
  const source = record(value)
  check(source.version === 2 && source.unit === "m")
  const rawBounds = record(source.bounds)
  const bounds = {
    width: number(rawBounds.width, 0.5, 200),
    depth: number(rawBounds.depth, 0.5, 200),
  }
  const wallHeight = number(source.wallHeight, 0.5, 20)
  const wallIds = new Set<string>()
  const walls = list(source.walls, 1024).map((value) => {
    const wall = record(value)
    const a = point(wall.a, bounds)
    const b = point(wall.b, bounds)
    check(Math.hypot(a[0] - b[0], a[1] - b[1]) > 1e-8)
    return {
      id: id(wall.id, wallIds),
      a,
      b,
      thickness: number(wall.thickness, Number.EPSILON, 200),
    }
  })
  const wallMap = new Map(walls.map((wall) => [wall.id, wall]))
  const openingIds = new Set<string>()
  const openings = list(source.openings, 1024).map((value) => {
    const opening = record(value)
    const wallId = id(opening.wallId)
    const wall = wallMap.get(wallId)
    check(wall)
    const length = Math.hypot(wall.a[0] - wall.b[0], wall.a[1] - wall.b[1])
    const from = number(opening.from, 0, length + 1e-8)
    const to = number(opening.to, 0, length + 1e-8)
    const bottom = number(opening.bottom, 0, wallHeight)
    const top = number(opening.top, 0, wallHeight)
    check(from < to && bottom < top)
    return {
      id: id(opening.id, openingIds),
      wallId,
      type: choice(opening.type, ["door", "window"] as const),
      from,
      to,
      bottom,
      top,
    }
  })
  let totalPoints = 0
  // Null optional fields from older/server-generated saves are safe empty values.
  const rooms = list(source.rooms ?? [], 128).map((value) => {
    const label = record(value)
    const points = list(label.polygon, 512, 3)
    totalPoints += points.length
    check(totalPoints <= 4096)
    return { name: text(label.name, 80), polygon: polygon(points, bounds) }
  })
  let origin: RoomModel["source"]
  if (source.source != null) {
    const raw = record(source.source)
    const roomCount = number(raw.roomCount, 1, 128)
    check(Number.isInteger(roomCount))
    origin = {
      areaPyeong: number(raw.areaPyeong, 0.1, 10000),
      roomCount,
      preset: text(raw.preset, 80),
    }
  }
  return {
    version: 2,
    unit: "m",
    wallHeight,
    bounds,
    outline: polygon(source.outline, bounds),
    walls,
    openings,
    rooms,
    ...(source.spawn != null ? { spawn: point(source.spawn, bounds) } : {}),
    ...(origin ? { source: origin } : {}),
  }
}

// Keep legacy reads below permissive. New writes must fit the API and DB schema.
export function assertFurnitureWrite(
  value: unknown
): asserts value is Furniture[] {
  check(Array.isArray(value))
  assertFurnitureCount(value.length)
  const ids = new Set<string>()
  for (const valueItem of value) {
    const item = record(valueItem)
    for (const [field, max, label] of [
      ["id", 100, "식별자"],
      ["catalogId", 100, "카탈로그 식별자"],
      ["name", 200, "이름"],
      ["color", 20, "색상"],
    ] as const) {
      const value = item[field]
      if (
        typeof value !== "string" ||
        !value.trim() ||
        value.length > max ||
        value.includes("\0")
      )
        throw new Error(
          `가구 ${label} 값을 확인해 주세요. 공백이 아닌 ${max}자 이내 값이 필요해요.`
        )
    }
    id(item.id, ids)
    id(item.catalogId)
    choice(item.category, ["소파", "테이블", "의자", "장식"] as const)
    number(item.x)
    number(item.z)
    number(item.rotation)
  }
}

export function parseStoredProject(value: unknown): Project {
  const project = record(value)
  const projectId = text(project.id, 64)
  check(/^[A-Za-z0-9_-]+$/.test(projectId))
  const dimensions = record(project.dimensions)
  const plan = record(project.floorPlan)
  const ids = new Set<string>()
  const furniture: Furniture[] = list(project.furniture, maxFurnitureCount).map(
    (value) => {
      const item = record(value)
      return {
        id: id(item.id, ids),
        catalogId: id(item.catalogId),
        name: text(item.name, 256),
        category: choice(item.category, [
          "소파",
          "테이블",
          "의자",
          "장식",
        ] as const),
        // Valid out-of-room furniture stays available to the existing repair UI.
        x: number(item.x),
        z: number(item.z),
        rotation: number(item.rotation),
        color: text(item.color, 64),
      }
    }
  )
  const size = number(plan.size, 0)
  check(Number.isSafeInteger(size))
  return {
    id: projectId,
    name: projectName(project.name),
    roomType: text(project.roomType, 80),
    dimensions: {
      width: number(dimensions.width, 0.5, 200),
      depth: number(dimensions.depth, 0.5, 200),
      height: number(dimensions.height, 0.5, 20),
    },
    ...(project.room != null ? { room: room(project.room) } : {}),
    furniture,
    floorPlan: {
      fileName: text(plan.fileName, 255, true),
      size,
      status: choice(plan.status, [
        "EMPTY",
        "PROCESSING",
        "READY",
        "FAILED",
      ] as const),
      progress: number(plan.progress, 0, 100),
      uploadedAt: plan.uploadedAt === null ? null : date(plan.uploadedAt),
    },
    updatedAt: date(project.updatedAt),
  }
}
