import * as THREE from "three"

import { addBox } from "./furniture-fallback"
import { labelPoint } from "./room-builder"
import { roomArea } from "./house-navigation"
import { footprint } from "./placement-issues"
import { planLabelAnchor } from "./plan-view"
import type {
  Furniture,
  Opening,
  Point2,
  RoomLabel,
  RoomModel,
  ViewMode,
  Wall,
} from "./types"

const colors = {
  floor: "#D8CAB5",
  floorEdge: "#A99780",
  ceiling: "#F4F2EC",
  exteriorWall: "#DDD2C1",
  interiorWall: "#EFE5D6",
  glass: "#B6CAC9",
  frame: "#F7F0E4",
  door: "#AA805B",
  label: "#40392F",
}

const planViewWallHeight = 0.35
const frameSize = 0.05
const doorOpenAngle = THREE.MathUtils.degToRad(85)
const doorOpenDistance = 1.3
const doorCloseDistance = 2.6
const doorSwingSpeed = 4
const walkerRadius = 0.25

export type DoorState = {
  id: string
  local: THREE.Group
  hinge: THREE.Group
  center: THREE.Vector3
  restAngle: number
  angle: number
  openTarget: number | null
  manualOpen: boolean | null
}

type WallPiece = {
  from: number
  to: number
  bottom: number
  top: number
}

function sliceWall(
  length: number,
  height: number,
  openings: Opening[]
): WallPiece[] {
  const sorted = [...openings]
    .map((opening) => ({
      ...opening,
      from: THREE.MathUtils.clamp(opening.from, 0, length),
      to: THREE.MathUtils.clamp(opening.to, 0, length),
      top: Math.min(opening.top, height),
    }))
    .filter((opening) => opening.to > opening.from && opening.bottom < height)
    .sort((left, right) => left.from - right.from)

  const pieces: WallPiece[] = []
  let cursor = 0
  for (const opening of sorted) {
    if (opening.from > cursor) {
      pieces.push({ from: cursor, to: opening.from, bottom: 0, top: height })
    }
    if (opening.bottom > 0) {
      pieces.push({
        from: opening.from,
        to: opening.to,
        bottom: 0,
        top: opening.bottom,
      })
    }
    if (opening.top < height) {
      pieces.push({
        from: opening.from,
        to: opening.to,
        bottom: opening.top,
        top: height,
      })
    }
    cursor = Math.max(cursor, opening.to)
  }
  if (cursor < length) {
    pieces.push({ from: cursor, to: length, bottom: 0, top: height })
  }
  return pieces
}

function wallFrame(wall: Wall) {
  const [ax, az] = wall.a
  const [bx, bz] = wall.b
  const dx = bx - ax
  const dz = bz - az
  const length = Math.hypot(dx, dz)
  return {
    length,
    angle: Math.atan2(-dz, dx),
    pointAt(distance: number, y: number, offsetX: number, offsetZ: number) {
      const t = length === 0 ? 0 : distance / length
      return new THREE.Vector3(ax + dx * t + offsetX, y, az + dz * t + offsetZ)
    },
  }
}

function buildPlanWall(
  wall: Wall,
  openings: Opening[],
  exterior: boolean,
  offsetX: number,
  offsetZ: number,
  doors: DoorState[]
) {
  const group = new THREE.Group()
  group.name = wall.id
  const frame = wallFrame(wall)
  group.position.copy(frame.pointAt(0, 0, offsetX, offsetZ))
  group.rotation.y = frame.angle
  const wallColor = exterior ? "#42564F" : "#73847B"
  const strip = (
    parent: THREE.Group,
    x: number,
    z: number,
    length: number,
    depth: number,
    color: string,
    y = 0.04
  ) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(length, 0.006, depth),
      new THREE.MeshBasicMaterial({ color })
    )
    mesh.position.set(x, y, z)
    parent.add(mesh)
    return mesh
  }
  const cuts = openings.map((opening) => ({ ...opening, bottom: 0, top: 1 }))
  for (const piece of sliceWall(frame.length, 1, cuts)) {
    strip(
      group,
      (piece.from + piece.to) / 2,
      0,
      piece.to - piece.from,
      wall.thickness,
      wallColor
    )
  }
  for (const opening of openings) {
    const width = opening.to - opening.from
    const local = new THREE.Group()
    local.name = opening.id
    local.position.x = opening.from
    group.add(local)
    if (opening.type === "window") {
      strip(local, width / 2, 0, width, wall.thickness, "#D3EBEE")
      strip(
        local,
        width / 2,
        -wall.thickness * 0.41,
        width,
        wall.thickness * 0.14,
        "#437E89",
        0.046
      )
      strip(
        local,
        width / 2,
        wall.thickness * 0.41,
        width,
        wall.thickness * 0.14,
        "#437E89",
        0.046
      )
      strip(
        local,
        width / 2,
        0,
        Math.min(0.035, width),
        wall.thickness,
        "#437E89",
        0.05
      )
      continue
    }
    local.userData.doorId = opening.id
    const hinge = new THREE.Group()
    local.add(hinge)
    strip(hinge, width / 2, 0, width, 0.048, "#995D37", 0.058)
    const arcPoints = Array.from({ length: 25 }, (_, i) => {
      const theta = (i / 24) * doorOpenAngle
      return new THREE.Vector3(
        width * Math.cos(theta),
        0.049,
        width * Math.sin(theta)
      )
    })
    const swing = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(arcPoints),
      new THREE.LineDashedMaterial({
        color: "#AD967E",
        dashSize: 0.065,
        gapSize: 0.035,
      })
    )
    swing.computeLineDistances()
    swing.name = "door-swing"
    swing.raycast = () => {} // The arc describes clearance; only the actual leaf toggles the door.
    local.add(swing)
    doors.push({
      id: opening.id,
      local,
      hinge,
      center: frame.pointAt(
        (opening.from + opening.to) / 2,
        0,
        offsetX,
        offsetZ
      ),
      restAngle: 0,
      angle: 0,
      openTarget: null,
      manualOpen: null,
    })
  }
  return group
}

function buildWall(
  wall: Wall,
  openings: Opening[],
  height: number,
  isExterior: boolean,
  offsetX: number,
  offsetZ: number,
  doorRest: number,
  doors: DoorState[]
) {
  const group = new THREE.Group()
  group.name = wall.id
  const frame = wallFrame(wall)
  if (frame.length === 0) return group

  const material = new THREE.MeshStandardMaterial({
    color: isExterior ? colors.exteriorWall : colors.interiorWall,
    roughness: 0.9,
  })

  for (const piece of sliceWall(frame.length, height, openings)) {
    const pieceLength = piece.to - piece.from
    const pieceHeight = piece.top - piece.bottom
    if (pieceLength <= 0 || pieceHeight <= 0) continue
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(pieceLength, pieceHeight, wall.thickness),
      material
    )
    mesh.position.copy(
      frame.pointAt(
        (piece.from + piece.to) / 2,
        piece.bottom + pieceHeight / 2,
        offsetX,
        offsetZ
      )
    )
    mesh.rotation.y = frame.angle
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
  }

  const glassMaterial = new THREE.MeshStandardMaterial({
    color: colors.glass,
    transparent: true,
    opacity: 0.45,
    roughness: 0.2,
  })
  const frameMaterial = new THREE.MeshStandardMaterial({
    color: colors.frame,
    roughness: 0.6,
  })
  const doorMaterial = new THREE.MeshStandardMaterial({
    color: colors.door,
    roughness: 0.7,
  })
  const frameDepth = wall.thickness + 0.02

  for (const opening of openings) {
    if (opening.bottom >= height) continue
    const top = Math.min(opening.top, height)
    const width = opening.to - opening.from
    const openingHeight = top - opening.bottom
    if (width <= 0 || openingHeight <= 0) continue

    const local = new THREE.Group()
    local.position.copy(frame.pointAt(opening.from, 0, offsetX, offsetZ))
    local.rotation.y = frame.angle
    group.add(local)

    const addFramePart = (
      size: [number, number, number],
      position: [number, number, number]
    ) => {
      const part = new THREE.Mesh(new THREE.BoxGeometry(...size), frameMaterial)
      part.position.set(...position)
      part.castShadow = true
      local.add(part)
    }
    addFramePart(
      [frameSize, openingHeight, frameDepth],
      [frameSize / 2, opening.bottom + openingHeight / 2, 0]
    )
    addFramePart(
      [frameSize, openingHeight, frameDepth],
      [width - frameSize / 2, opening.bottom + openingHeight / 2, 0]
    )
    addFramePart(
      [width, frameSize, frameDepth],
      [width / 2, top - frameSize / 2, 0]
    )

    if (opening.type === "window") {
      addFramePart(
        [width, frameSize, frameDepth],
        [width / 2, opening.bottom + frameSize / 2, 0]
      )
      const glass = new THREE.Mesh(
        new THREE.BoxGeometry(
          width - frameSize * 2,
          openingHeight - frameSize * 2,
          0.02
        ),
        glassMaterial
      )
      glass.position.set(width / 2, opening.bottom + openingHeight / 2, 0)
      local.add(glass)
    } else {
      local.userData.doorId = opening.id
      const hinge = new THREE.Group()
      hinge.position.set(frameSize, 0, 0)
      hinge.rotation.y = doorRest
      local.add(hinge)
      doors.push({
        id: opening.id,
        local,
        hinge,
        center: frame.pointAt(
          (opening.from + opening.to) / 2,
          0,
          offsetX,
          offsetZ
        ),
        restAngle: doorRest,
        angle: doorRest,
        openTarget: null,
        manualOpen: null,
      })
      const leafWidth = width - frameSize * 2
      const leaf = new THREE.Mesh(
        new THREE.BoxGeometry(leafWidth, openingHeight - frameSize, 0.04),
        doorMaterial
      )
      leaf.position.set(leafWidth / 2, (openingHeight - frameSize) / 2, 0)
      leaf.castShadow = true
      hinge.add(leaf)
    }
  }

  return group
}

function buildCeiling(
  outline: Point2[],
  height: number,
  offsetX: number,
  offsetZ: number
) {
  const shape = new THREE.Shape(
    outline.map(([x, z]) => new THREE.Vector2(x + offsetX, -(z + offsetZ)))
  )
  const mesh = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshStandardMaterial({
      color: colors.ceiling,
      roughness: 0.95,
      side: THREE.BackSide,
    })
  )
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = height
  return mesh
}

function buildFloor(
  outline: Point2[],
  offsetX: number,
  offsetZ: number,
  floorMap?: THREE.Texture
) {
  const shape = new THREE.Shape(
    outline.map(([x, z]) => new THREE.Vector2(x + offsetX, -(z + offsetZ)))
  )
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.12,
    bevelEnabled: false,
  })
  const mesh = new THREE.Mesh(geometry, [
    new THREE.MeshStandardMaterial({
      color: floorMap ? "#FFFFFF" : colors.floor,
      map: floorMap ?? null,
      roughness: 0.86,
    }),
    new THREE.MeshStandardMaterial({
      color: colors.floorEdge,
      roughness: 0.9,
    }),
  ])
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = -0.12
  mesh.name = "room-floor"
  mesh.receiveShadow = true
  mesh.castShadow = true
  return mesh
}

function makeLabelSprite(text: string, mode: ViewMode, area?: string) {
  const canvas = document.createElement("canvas")
  const context = canvas.getContext("2d")
  const scale = 4
  // DOM과 같은 SEED 글꼴을 쓰고, Type의 label 역할처럼 medium 두께로 표시합니다.
  const family =
    typeof document === "undefined"
      ? "sans-serif"
      : getComputedStyle(document.body).fontFamily || "sans-serif"
  const font = `${area ? 600 : 500} ${14 * scale}px ${family}`
  if (!context) return null
  context.font = font
  const padding = (area ? 2 : 10) * scale
  const textWidth = Math.max(
    context.measureText(text).width,
    area ? context.measureText(area).width : 0
  )
  canvas.width = Math.ceil(textWidth) + padding * 2
  canvas.height = (area ? 28 : 24) * scale
  context.font = font
  if (!area) {
    context.fillStyle = "rgba(255, 252, 246, 0.92)"
    context.beginPath()
    context.roundRect(0, 0, canvas.width, canvas.height, canvas.height / 2)
    context.fill()
  }
  context.fillStyle = colors.label
  context.textBaseline = "middle"
  if (area) {
    context.textAlign = "center"
    context.fillStyle = "#34463E"
    context.fillText(text, canvas.width / 2, 8 * scale)
    context.font = `400 ${11 * scale}px ${family}`
    context.fillStyle = "#53655C"
    context.fillText(area, canvas.width / 2, 21.5 * scale)
  } else context.fillText(text, padding, canvas.height / 2)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: mode === "vr",
      depthWrite: false,
      toneMapped: false,
    })
  )
  const worldHeight =
    mode === "vr"
      ? 0.15
      : window.matchMedia("(max-width: 820px)").matches
        ? 0.48
        : 0.32
  const height = area ? worldHeight * 1.42 : worldHeight
  sprite.scale.set((canvas.width / canvas.height) * height, height, 1)
  sprite.renderOrder = 10
  return sprite
}

function isOnSegment([px, pz]: Point2, [ax, az]: Point2, [bx, bz]: Point2) {
  const epsilon = 1e-3
  const cross = (bx - ax) * (pz - az) - (bz - az) * (px - ax)
  if (Math.abs(cross) > epsilon) return false
  return (
    px >= Math.min(ax, bx) - epsilon &&
    px <= Math.max(ax, bx) + epsilon &&
    pz >= Math.min(az, bz) - epsilon &&
    pz <= Math.max(az, bz) + epsilon
  )
}

function isExteriorWall(wall: Wall, outline: Point2[]) {
  const onOutline = (point: Point2) =>
    outline.some((start, index) =>
      isOnSegment(point, start, outline[(index + 1) % outline.length])
    )
  return onOutline(wall.a) && onOutline(wall.b)
}

function pointInPolygon([px, pz]: Point2, polygon: Point2[]) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i]
    const [xj, zj] = polygon[j]
    const crosses =
      zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi
    if (crosses) inside = !inside
  }
  return inside
}

function studioWallHeight(
  wall: Wall,
  model: RoomModel,
  exterior: boolean,
  overview: boolean
) {
  if (!exterior)
    return overview ? Math.min(model.wallHeight, 1.82) : model.wallHeight
  const dx = wall.b[0] - wall.a[0]
  const dz = wall.b[1] - wall.a[1]
  const length = Math.hypot(dx, dz)
  if (!length) return model.wallHeight
  const x = (wall.a[0] + wall.b[0]) / 2
  const z = (wall.a[1] + wall.b[1]) / 2
  const nx = -dz / length
  const nz = dx / length
  const positiveInside = pointInPolygon(
    [x + nx * 0.02, z + nz * 0.02],
    model.outline
  )
  const negativeInside = pointInPolygon(
    [x - nx * 0.02, z - nz * 0.02],
    model.outline
  )
  if (positiveInside === negativeInside) return model.wallHeight
  // The opening camera views the house from the positive X and Z corner.
  const outwardTowardCamera = (positiveInside ? -1 : 1) * (nx * 5 + nz * 7)
  return outwardTowardCamera > 1.5
    ? Math.min(model.wallHeight, 0.74)
    : model.wallHeight
}

function buildPlacementGrid(model: RoomModel, visible: boolean) {
  const { width, depth } = model.bounds
  const spacing = Math.max(0.2, Math.max(width, depth) / 64)
  const positions: number[] = []
  const appendLines = (axis: 0 | 1, extent: number) => {
    const crossAxis = axis === 0 ? 1 : 0
    for (let line = spacing; line < extent; line += spacing) {
      const crossings: number[] = []
      for (let i = 0; i < model.outline.length; i++) {
        const a = model.outline[i]
        const b = model.outline[(i + 1) % model.outline.length]
        if (a[axis] > line === b[axis] > line) continue
        const t = (line - a[axis]) / (b[axis] - a[axis])
        crossings.push(a[crossAxis] + t * (b[crossAxis] - a[crossAxis]))
      }
      crossings.sort((a, b) => a - b)
      for (let i = 0; i + 1 < crossings.length; i += 2) {
        for (const cross of [crossings[i], crossings[i + 1]]) {
          const [x, z] = axis === 0 ? [line, cross] : [cross, line]
          positions.push(x - width / 2, 0.012, z - depth / 2)
        }
      }
    }
  }
  appendLines(0, width)
  appendLines(1, depth)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  )
  const grid = new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({
      color: "#81715C",
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
    })
  )
  grid.name = "placement-grid"
  grid.visible = visible
  return grid
}

export function isInsideRoom(model: RoomModel, worldX: number, worldZ: number) {
  return pointInPolygon(
    [worldX + model.bounds.width / 2, worldZ + model.bounds.depth / 2],
    model.outline
  )
}

export function createWalkableTest(model: RoomModel, doors: DoorState[] = []) {
  const offsetX = -model.bounds.width / 2
  const offsetZ = -model.bounds.depth / 2
  const walls = model.walls.map((wall) => {
    const [ax, az] = wall.a
    const [bx, bz] = wall.b
    const dx = bx - ax
    const dz = bz - az
    const lengthSq = dx * dx + dz * dz
    const doorSpans = model.openings
      .filter(
        (opening) => opening.wallId === wall.id && opening.type === "door"
      )
      .map((opening) => ({
        id: opening.id,
        from: opening.from + frameSize + walkerRadius,
        to: opening.to - frameSize - walkerRadius,
      }))
    return {
      ax: ax + offsetX,
      az: az + offsetZ,
      dx,
      dz,
      length: Math.sqrt(lengthSq),
      lengthSq,
      blockDistance: walkerRadius + wall.thickness / 2,
      doorSpans,
    }
  })

  return (x: number, z: number) => {
    if (!isInsideRoom(model, x, z)) return false
    for (const wall of walls) {
      if (wall.lengthSq === 0) continue
      const t = THREE.MathUtils.clamp(
        ((x - wall.ax) * wall.dx + (z - wall.az) * wall.dz) / wall.lengthSq,
        0,
        1
      )
      const nearestX = wall.ax + wall.dx * t
      const nearestZ = wall.az + wall.dz * t
      if (Math.hypot(x - nearestX, z - nearestZ) >= wall.blockDistance) continue
      const along = t * wall.length
      const inDoor = wall.doorSpans.some(
        ({ id, from, to }) =>
          along >= from &&
          along <= to &&
          Math.abs(doors.find((door) => door.id === id)?.angle ?? 0) >=
            Math.PI * 0.45
      )
      if (!inDoor) return false
    }
    return true
  }
}

const doorLocalPoint = new THREE.Vector3()

export function setManualDoorStates(
  doors: DoorState[],
  states: Record<string, boolean>
) {
  for (const door of doors) door.manualOpen = states[door.id] ?? null
}

export function animateDoors(
  doors: DoorState[],
  person: THREE.Vector3 | null,
  deltaSeconds: number
) {
  for (const door of doors) {
    if (door.manualOpen !== null) {
      door.openTarget = door.manualOpen ? -doorOpenAngle : null
    } else if (person) {
      const distance = Math.hypot(
        person.x - door.center.x,
        person.z - door.center.z
      )
      if (door.openTarget === null && distance < doorOpenDistance) {
        door.local.worldToLocal(doorLocalPoint.copy(person))
        door.openTarget = doorLocalPoint.z > 0 ? doorOpenAngle : -doorOpenAngle
      } else if (door.openTarget !== null && distance > doorCloseDistance) {
        door.openTarget = null
      }
    } else {
      door.openTarget = null
    }
    const target = door.openTarget ?? door.restAngle
    const maxStep = doorSwingSpeed * deltaSeconds
    door.angle += THREE.MathUtils.clamp(target - door.angle, -maxStep, maxStep)
    door.hinge.rotation.y = door.angle
  }
}

export function roomSpawnPoint(model: RoomModel) {
  const [x, z] = model.spawn ?? [model.bounds.width / 2, model.bounds.depth / 2]
  return new THREE.Vector3(
    x - model.bounds.width / 2,
    0,
    z - model.bounds.depth / 2
  )
}

export function buildRoomGroup(
  model: RoomModel,
  mode: ViewMode,
  previousDoorAngles?: ReadonlyMap<string, number>,
  {
    overview = false,
    focusRoom,
    floorMap,
  }: {
    overview?: boolean
    focusRoom?: RoomLabel | null
    floorMap?: THREE.Texture
  } = {}
) {
  const group = new THREE.Group()
  const offsetX = -model.bounds.width / 2
  const offsetZ = -model.bounds.depth / 2
  const wallHeight =
    mode === "2d"
      ? Math.min(planViewWallHeight, model.wallHeight)
      : model.wallHeight

  if (mode === "2d") {
    const shape = new THREE.Shape(
      model.outline.map(
        ([x, z]) => new THREE.Vector2(x + offsetX, -z - offsetZ)
      )
    )
    const floor = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      new THREE.MeshBasicMaterial({ color: "#FFFEF9" })
    )
    floor.rotation.x = -Math.PI / 2
    group.add(floor)
  } else group.add(buildFloor(model.outline, offsetX, offsetZ, floorMap))

  const doorRest = 0
  const doors: DoorState[] = []
  for (const wall of model.walls) {
    const openings = model.openings.filter(
      (opening) => opening.wallId === wall.id
    )
    const exterior = isExteriorWall(wall, model.outline)
    if (mode === "2d") {
      group.add(
        buildPlanWall(wall, openings, exterior, offsetX, offsetZ, doors)
      )
      continue
    }
    group.add(
      buildWall(
        wall,
        openings,
        mode === "3d"
          ? studioWallHeight(wall, model, exterior, overview)
          : wallHeight,
        exterior,
        offsetX,
        offsetZ,
        doorRest,
        doors
      )
    )
  }
  for (const door of doors) {
    const angle = previousDoorAngles?.get(door.id)
    if (angle === undefined) continue
    door.angle = angle
    door.hinge.rotation.y = angle
  }
  group.userData.doors = doors

  if (mode === "vr") {
    group.add(buildCeiling(model.outline, wallHeight, offsetX, offsetZ))
  }

  const labelHeight =
    mode === "vr" ? wallHeight - 0.35 : overview ? 0.52 : wallHeight + 0.25
  const labeledRooms = mode === "3d" && focusRoom ? [] : model.rooms
  for (const room of labeledRooms) {
    const sprite = makeLabelSprite(
      room.name,
      mode,
      mode === "2d" ? `${roomArea(room).toFixed(1)} m²` : undefined
    )
    if (!sprite) continue
    const [x, z] = labelPoint(room.polygon)
    if (mode === "2d") sprite.userData.planRoom = room
    sprite.position.set(x + offsetX, labelHeight, z + offsetZ)
    group.add(sprite)
  }

  if (mode !== "vr") group.add(buildPlacementGrid(model, false))

  return group
}

export function updatePlanLabels(
  roomGroup: THREE.Group,
  model: RoomModel,
  furniture: Furniture[]
) {
  const occupied = furniture.map(footprint).filter((box) => box !== null)
  for (const sprite of roomGroup.children) {
    const room = sprite.userData.planRoom as RoomLabel | undefined
    if (!room) continue
    const [x, z] = planLabelAnchor(
      room,
      occupied,
      sprite.scale.x,
      sprite.scale.y
    )
    sprite.position.x = x - model.bounds.width / 2
    sprite.position.z = z - model.bounds.depth / 2
  }
}

export function buildDimensionRoom(
  mode: ViewMode,
  { width, depth, height }: { width: number; depth: number; height: number }
) {
  const group = new THREE.Group()
  addBox(group, [width, 0.12, depth], [0, -0.06, 0], "#E4E6EB").name =
    "room-floor"
  if (mode === "2d") return group
  addBox(
    group,
    [width, height, 0.1],
    [0, height / 2, -depth / 2 - 0.05],
    "#FFFFFF"
  )
  addBox(
    group,
    [0.1, height, depth],
    [-width / 2 - 0.05, height / 2, 0],
    "#F7F8FA"
  )
  const windowWidth = Math.min(2.4, width * 0.48),
    windowHeight = Math.min(1.25, height * 0.58)
  const x = width * 0.14,
    y = height * 0.625,
    z = -depth / 2
  addBox(
    group,
    [windowWidth, windowHeight, 0.025],
    [x, y, z + 0.011],
    "#B8DAED"
  )
  addBox(group, [0.06, windowHeight + 0.04, 0.04], [x, y, z + 0.035], "#FFFFFF")
  addBox(group, [windowWidth + 0.06, 0.06, 0.04], [x, y, z + 0.05], "#FFFFFF")
  return group
}
