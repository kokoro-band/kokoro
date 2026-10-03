import { catalog } from "./data"
import {
  findFurniturePlacement,
  constrainFurniturePose,
} from "./furniture-motion"
import { assertFurnitureCount } from "./input-limits"
import { containsPoint } from "./house-navigation"
import { placementIssues } from "./placement-issues"
import { makeFurniture, proposeLocalCommand } from "./project-api"
import type { BrowserIntent } from "./browser-ai-intent"
import type {
  CommandResponse,
  Furniture,
  Point2,
  Project,
  RoomLabel,
} from "./types"

function area(project: Project, focus?: Point2[]) {
  const points = focus?.length
    ? focus
    : [
        [0, 0],
        [
          project.room?.bounds.width ?? project.dimensions.width,
          project.room?.bounds.depth ?? project.dimensions.depth,
        ],
      ]
  const xs = points.map(([x]) => x)
  const zs = points.map(([, z]) => z)
  const left = Math.min(...xs)
  const front = Math.min(...zs)
  return {
    left,
    front,
    width: Math.max(...xs) - left,
    depth: Math.max(...zs) - front,
  }
}

function targetPositions(
  project: Project,
  intent: BrowserIntent,
  focus?: Point2[],
  origin?: Point2
): Point2[] {
  const placement = intent.placement!
  const { left, front, width, depth } = area(project, focus)
  if (placement === "NEAR_TARGET") {
    const anchors = project.furniture.filter(
      (entry) => entry.catalogId === intent.anchorCatalogId
    )
    if (anchors.length !== 1)
      throw new Error("기준 가구를 하나로 정할 수 없어요. 배치는 유지했어요.")
    const anchor = anchors[0]
    const anchorSize = catalog.find((entry) => entry.id === anchor.catalogId)
    const targetSize = catalog.find((entry) => entry.id === intent.catalogId)
    if (!anchorSize || !targetSize)
      throw new Error("기준 가구의 규격을 확인할 수 없어요. 배치는 유지했어요.")
    const dx = (anchorSize.width + targetSize.width) / 2 + 0.25
    const dz = (anchorSize.depth + targetSize.depth) / 2 + 0.25
    const diagonalX = (anchorSize.width + targetSize.width) / 2 + 0.05
    const diagonalZ = (anchorSize.depth + targetSize.depth) / 2 + 0.05
    const nearby: Point2[] = []
    for (let x = -12; x <= 12; x++) {
      for (let z = -12; z <= 12; z++) {
        if (Math.hypot(x, z) > 12.5) continue
        nearby.push([anchor.x + x * 0.2, anchor.z + z * 0.2])
      }
    }
    nearby.sort(
      (a, b) =>
        Math.hypot(a[0] - anchor.x, a[1] - anchor.z) -
        Math.hypot(b[0] - anchor.x, b[1] - anchor.z)
    )
    return [
      [anchor.x + dx, anchor.z],
      [anchor.x - dx, anchor.z],
      [anchor.x, anchor.z + dz],
      [anchor.x, anchor.z - dz],
      [anchor.x + diagonalX, anchor.z + diagonalZ],
      [anchor.x + diagonalX, anchor.z - diagonalZ],
      [anchor.x - diagonalX, anchor.z + diagonalZ],
      [anchor.x - diagonalX, anchor.z - diagonalZ],
      ...nearby,
    ]
  }
  if (placement === "NEAR_WINDOW") {
    const center: Point2 = [left + width / 2, front + depth / 2]
    const point = origin ?? center
    const windows = project.room?.openings.flatMap((opening) => {
      if (opening.type !== "window") return []
      const wall = project.room?.walls.find(
        (item) => item.id === opening.wallId
      )
      if (!wall) return []
      const length = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1])
      if (!length) return []
      const ratio = (opening.from + opening.to) / 2 / length
      const x = wall.a[0] + (wall.b[0] - wall.a[0]) * ratio
      const z = wall.a[1] + (wall.b[1] - wall.a[1]) * ratio
      const distance = Math.hypot(center[0] - x, center[1] - z) || 1
      return [
        [
          x + ((center[0] - x) / distance) * 1.2,
          z + ((center[1] - z) / distance) * 1.2,
        ] as Point2,
      ]
    })
    if (!windows?.length)
      throw new Error("창문 위치 정보가 없어 창가 배치를 제안할 수 없어요.")
    return windows.sort(
      (a, b) =>
        Math.hypot(a[0] - point[0], a[1] - point[1]) -
        Math.hypot(b[0] - point[0], b[1] - point[1])
    )
  }
  const ratios: Record<
    Exclude<BrowserIntent["placement"], "NEAR_WINDOW" | "NEAR_TARGET" | null>,
    Point2
  > = {
    CENTER: [0.5, 0.5],
    LEFT: [0.25, 0.5],
    RIGHT: [0.75, 0.5],
    FRONT: [0.5, 0.25],
    BACK: [0.5, 0.75],
  }
  const [x, z] = ratios[placement]
  return [[left + width * x, front + depth * z]]
}

function findSafePlacement(
  project: Project,
  item: Furniture,
  positions: Point2[],
  room: RoomLabel | null,
  requireProximity: boolean
) {
  const exists = project.furniture.some((entry) => entry.id === item.id)
  for (const [x, z] of positions) {
    const candidate = findFurniturePlacement(project, { ...item, x, z }, room)
    if (!candidate) continue
    if (requireProximity && Math.hypot(candidate.x - x, candidate.z - z) > 0.75)
      continue
    const furniture = exists
      ? project.furniture.map((entry) =>
          entry.id === item.id ? candidate : entry
        )
      : [...project.furniture, candidate]
    if (
      !placementIssues({ ...project, furniture }).some(
        (issue) => issue.furnitureId === item.id
      )
    )
      return candidate
  }
  return null
}

function roomAt(project: Project, item: Furniture): RoomLabel | null {
  return (
    project.room?.rooms.find((room) =>
      containsPoint(room.polygon, item.x, item.z)
    ) ?? null
  )
}

function candidateResponse(
  project: Project,
  matches: Furniture[]
): CommandResponse {
  return {
    reply: "어떤 가구를 바꿀지 골라 주세요.",
    project,
    commands: [],
    appliedActions: [],
    requiresConfirmation: false,
    proposalId: null,
    expiresAt: null,
    proposedCommands: [],
    candidates: matches.map(({ id, name }) => ({ furnitureId: id, name })),
  }
}

export function proposeBrowserIntent(
  project: Project,
  intent: BrowserIntent,
  focus?: Point2[],
  furnitureId?: string
): CommandResponse {
  if (intent.action === "UNSUPPORTED")
    throw new Error(
      "한 번에 한 가지 가구 변경을 요청해 주세요. 배치는 유지했어요."
    )
  if (intent.action === "CLEAR") {
    if (!project.furniture.length) throw new Error("비울 가구가 없어요.")
    return proposeLocalCommand(
      project,
      { ...project, furniture: [] },
      [{ type: "CLEAR" }],
      "가구를 모두 비우는 제안을 확인해 주세요.",
      ["가구를 모두 비웠어요"]
    )
  }
  const item = catalog.find((entry) => entry.id === intent.catalogId)
  if (!item) throw new Error("카탈로그에 없는 가구예요. 배치는 유지했어요.")
  const selectedRoom: RoomLabel | null = focus?.length
    ? { name: "선택한 방", polygon: focus }
    : null
  if (intent.action === "ADD") {
    assertFurnitureCount(project.furniture.length + 1)
    const anchor = project.furniture.find(
      (entry) => entry.catalogId === intent.anchorCatalogId
    )
    const room = selectedRoom ?? (anchor ? roomAt(project, anchor) : null)
    const placed = findSafePlacement(
      project,
      makeFurniture(item.id, 0, 0),
      targetPositions(project, intent, room?.polygon ?? focus),
      room,
      intent.placement === "NEAR_TARGET" || intent.placement === "NEAR_WINDOW"
    )
    if (!placed) throw new Error("이 공간에는 가구를 놓을 자리가 없어요.")
    const proposed = { ...project, furniture: [...project.furniture, placed] }
    return proposeLocalCommand(
      project,
      proposed,
      [
        {
          type: "ADD",
          catalogId: item.id,
          furnitureId: placed.id,
          x: placed.x,
          z: placed.z,
          rotation: placed.rotation,
        },
      ],
      `${item.name} 추가 제안을 확인해 주세요.`,
      [`${item.name} 추가`]
    )
  }
  const matches = project.furniture.filter(
    (entry) => entry.catalogId === item.id
  )
  if (!matches.length)
    throw new Error(
      "현재 배치에서 해당 가구를 찾지 못했어요. 배치는 유지했어요."
    )
  if (furnitureId && !matches.some((entry) => entry.id === furnitureId))
    throw new Error(
      "선택한 가구가 현재 요청과 맞지 않아요. 다시 요청해 주세요."
    )
  if (!furnitureId && matches.length > 1)
    return candidateResponse(project, matches)
  const current =
    matches.find((entry) => entry.id === furnitureId) ?? matches[0]
  const anchor = project.furniture.find(
    (entry) => entry.catalogId === intent.anchorCatalogId
  )
  const room = selectedRoom ?? roomAt(project, anchor ?? current)
  let next: Furniture | null = current
  if (intent.action === "MOVE") {
    if (
      intent.placement === "NEAR_TARGET" &&
      intent.anchorCatalogId === current.catalogId
    )
      throw new Error("가구를 자기 자신 옆으로 옮길 수 없어요.")
    next = findSafePlacement(
      project,
      current,
      targetPositions(project, intent, room?.polygon ?? focus, [
        current.x,
        current.z,
      ]),
      room,
      intent.placement === "NEAR_TARGET" || intent.placement === "NEAR_WINDOW"
    )
  } else if (intent.action === "ROTATE") {
    next = constrainFurniturePose(
      project,
      current,
      { rotation: intent.rotation! },
      room
    )
  }
  if (!next) throw new Error("이 공간에서는 가구를 옮길 수 없어요.")
  if (
    intent.action === "ROTATE" &&
    Math.abs(next.rotation - intent.rotation!) > 0.5
  )
    throw new Error("요청한 각도까지 회전할 공간이 없어요. 배치는 유지했어요.")
  if (
    intent.action !== "REMOVE" &&
    next.x === current.x &&
    next.z === current.z &&
    next.rotation === current.rotation
  )
    throw new Error("요청한 위치나 방향으로 바꿀 수 없어요. 배치는 유지했어요.")
  const furniture =
    intent.action === "REMOVE"
      ? project.furniture.filter((entry) => entry.id !== current.id)
      : project.furniture.map((entry) =>
          entry.id === current.id ? next! : entry
        )
  const proposed = { ...project, furniture }
  if (
    intent.action !== "REMOVE" &&
    placementIssues(proposed).some((issue) => issue.furnitureId === current.id)
  )
    throw new Error("제안 위치가 다른 가구나 문과 겹쳐요. 배치는 유지했어요.")
  const command =
    intent.action === "REMOVE"
      ? { type: "REMOVE" as const, furnitureId: current.id }
      : {
          type: intent.action,
          furnitureId: current.id,
          catalogId: current.catalogId,
          x: next.x,
          z: next.z,
          rotation: next.rotation,
        }
  return proposeLocalCommand(
    project,
    proposed,
    [command],
    `${current.name} ${intent.action === "REMOVE" ? "삭제" : intent.action === "MOVE" ? "이동" : "회전"} 제안을 확인해 주세요.`,
    [`${current.name} 변경`]
  )
}
