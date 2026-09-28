import * as THREE from "three"

import { labelPoint } from "./room-builder"
import type { Opening, Point2, RoomModel, ViewMode, Wall } from "./types"

const colors = {
  floor: "#D8CAB5",
  ceiling: "#F4F2EC",
  exteriorWall: "#EDECE5",
  interiorWall: "#F8F7F2",
  glass: "#BED4D9",
  frame: "#FFFFFF",
  door: "#B98958",
  label: "#4A4E57",
}

const planViewWallHeight = 0.35
const frameSize = 0.05
const doorRestAngle = THREE.MathUtils.degToRad(35)
const doorOpenAngle = THREE.MathUtils.degToRad(85)
const doorOpenDistance = 1.3
const doorCloseDistance = 2.6
const doorSwingSpeed = 4
const walkerRadius = 0.25

export type DoorState = {
  local: THREE.Group
  hinge: THREE.Group
  center: THREE.Vector3
  restAngle: number
  angle: number
  openTarget: number | null
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
      const hinge = new THREE.Group()
      hinge.position.set(frameSize, 0, 0)
      hinge.rotation.y = doorRest
      local.add(hinge)
      doors.push({
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
      side: THREE.DoubleSide,
    })
  )
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = height
  return mesh
}

function buildFloor(outline: Point2[], offsetX: number, offsetZ: number) {
  const shape = new THREE.Shape(
    outline.map(([x, z]) => new THREE.Vector2(x + offsetX, -(z + offsetZ)))
  )
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.12,
    bevelEnabled: false,
  })
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: colors.floor, roughness: 0.85 })
  )
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = -0.12
  mesh.receiveShadow = true
  return mesh
}

function makeLabelSprite(text: string) {
  const canvas = document.createElement("canvas")
  const context = canvas.getContext("2d")
  const scale = 4
  // DOM과 같은 SEED 글꼴을 쓰고, Type의 label 역할처럼 medium 두께로 표시합니다.
  const family =
    typeof document === "undefined"
      ? "sans-serif"
      : getComputedStyle(document.body).fontFamily || "sans-serif"
  const font = `500 ${14 * scale}px ${family}`
  if (!context) return null
  context.font = font
  const padding = 10 * scale
  canvas.width = Math.ceil(context.measureText(text).width) + padding * 2
  canvas.height = 24 * scale
  context.font = font
  context.fillStyle = "rgba(255, 255, 255, 0.82)"
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = colors.label
  context.textBaseline = "middle"
  context.fillText(text, padding, canvas.height / 2)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, depthTest: false })
  )
  const worldHeight = window.matchMedia("(max-width: 820px)").matches
    ? 0.9
    : 0.32
  sprite.scale.set((canvas.width / canvas.height) * worldHeight, worldHeight, 1)
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

export function isInsideRoom(model: RoomModel, worldX: number, worldZ: number) {
  return pointInPolygon(
    [worldX + model.bounds.width / 2, worldZ + model.bounds.depth / 2],
    model.outline
  )
}

export function createWalkableTest(model: RoomModel) {
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
      .map((opening) => [opening.from - 0.05, opening.to + 0.05] as const)
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
        ([from, to]) => along >= from && along <= to
      )
      if (!inDoor) return false
    }
    return true
  }
}

const doorLocalPoint = new THREE.Vector3()

export function animateDoors(
  doors: DoorState[],
  person: THREE.Vector3,
  deltaSeconds: number
) {
  for (const door of doors) {
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

export function buildRoomGroup(model: RoomModel, mode: ViewMode) {
  const group = new THREE.Group()
  const offsetX = -model.bounds.width / 2
  const offsetZ = -model.bounds.depth / 2
  const wallHeight =
    mode === "2d"
      ? Math.min(planViewWallHeight, model.wallHeight)
      : model.wallHeight

  group.add(buildFloor(model.outline, offsetX, offsetZ))

  const doorRest = mode === "vr" ? 0 : -doorRestAngle
  const doors: DoorState[] = []
  for (const wall of model.walls) {
    const openings = model.openings.filter(
      (opening) => opening.wallId === wall.id
    )
    group.add(
      buildWall(
        wall,
        openings,
        wallHeight,
        isExteriorWall(wall, model.outline),
        offsetX,
        offsetZ,
        doorRest,
        doors
      )
    )
  }
  group.userData.doors = doors

  if (mode === "vr") {
    group.add(buildCeiling(model.outline, wallHeight, offsetX, offsetZ))
  }

  const labelHeight = mode === "vr" ? wallHeight - 0.35 : wallHeight + 0.25
  for (const room of model.rooms) {
    const sprite = makeLabelSprite(room.name)
    if (!sprite) continue
    const [x, z] = labelPoint(room.polygon)
    sprite.position.set(x + offsetX, labelHeight, z + offsetZ)
    group.add(sprite)
  }

  const grid = new THREE.GridHelper(
    Math.max(model.bounds.width, model.bounds.depth),
    Math.round(Math.max(model.bounds.width, model.bounds.depth) * 5),
    "#B4A58F",
    "#C3B59F"
  )
  grid.position.y = 0.008
  grid.material.transparent = true
  grid.material.opacity = 0.18
  group.add(grid)

  return group
}
