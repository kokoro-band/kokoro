// @vitest-environment happy-dom
import * as THREE from "three"
import { describe, expect, it, vi } from "vite-plus/test"

import {
  animateDoors,
  updatePlanLabels,
  buildDimensionRoom,
  buildRoomGroup,
  type DoorState,
} from "./room-geometry"
import { sampleProject } from "./data"
import { footprint, overlaps } from "./placement-issues"
import { sampleRoom } from "./sample-room"
import type { RoomModel, ViewMode } from "./types"

function roomWithDoor(a: [number, number], b: [number, number]): RoomModel {
  return {
    version: 2,
    unit: "m",
    wallHeight: 2.4,
    bounds: { width: 4, depth: 4 },
    outline: [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
    ],
    walls: [{ id: "w", a, b, thickness: 0.12 }],
    openings: [
      {
        id: "door",
        wallId: "w",
        type: "door",
        from: 1,
        to: 2,
        bottom: 0,
        top: 2.1,
      },
    ],
    rooms: [],
  }
}

function leafSide(model: RoomModel, mode: ViewMode) {
  const group = buildRoomGroup(model, mode)
  const door = (group.userData.doors as DoorState[])[0]
  if (mode !== "vr") {
    door.manualOpen = true
    animateDoors([door], null, 1)
  }
  group.updateMatrixWorld(true)
  const leaf = door.hinge.getWorldPosition(new THREE.Vector3())
  const tip = door.hinge.children[0].getWorldPosition(new THREE.Vector3())
  const wall = model.walls[0]
  const length = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1])
  const planSide = {
    x: -(wall.b[1] - wall.a[1]) / length,
    z: (wall.b[0] - wall.a[0]) / length,
  }
  return (tip.x - leaf.x) * planSide.x + (tip.z - leaf.z) * planSide.z
}

describe("manual door swing direction", () => {
  it("opens to the same side the structure editor draws the swing", () => {
    expect(leafSide(roomWithDoor([0, 2], [4, 2]), "3d")).toBeGreaterThan(0)
  })

  it("follows the drawn side when the wall runs the other way", () => {
    expect(leafSide(roomWithDoor([4, 2], [0, 2]), "3d")).toBeGreaterThan(0)
  })

  it("follows the drawn side on a vertical wall", () => {
    expect(leafSide(roomWithDoor([2, 0], [2, 4]), "2d")).toBeGreaterThan(0)
  })

  it("stays closed when entering VR", () => {
    expect(Math.abs(leafSide(roomWithDoor([0, 2], [4, 2]), "vr"))).toBeLessThan(
      1e-6
    )
  })
})

describe("whole-house 3D presentation", () => {
  const plan = { ...sampleRoom, rooms: [] }

  it("lowers the exterior wall facing the opening camera and keeps the opposite wall tall", () => {
    const room = buildRoomGroup(plan, "3d", undefined, { overview: true })
    expect(new THREE.Box3().setFromObject(room).max.y).toBeCloseTo(
      plan.wallHeight
    )
    const wallHeight = (id: string) =>
      new THREE.Box3().setFromObject(room.getObjectByName(id)!).max.y
    expect(wallHeight("ext-bottom")).toBeCloseTo(0.74)
    expect(wallHeight("ext-top")).toBeCloseTo(sampleRoom.wallHeight)
    const focused = buildRoomGroup(plan, "3d")
    const focusedWall = focused.getObjectByName("ext-bottom")!
    expect(new THREE.Box3().setFromObject(focusedWall).max.y).toBeCloseTo(0.74)
    const vr = buildRoomGroup(plan, "vr")
    const vrWall = vr.getObjectByName("ext-bottom")!
    expect(new THREE.Box3().setFromObject(vrWall).max.y).toBeCloseTo(
      sampleRoom.wallHeight
    )
  })

  it("lets VR walls occlude room labels at a readable physical size", () => {
    using context = vi.spyOn(HTMLCanvasElement.prototype, "getContext")
    context.mockReturnValue({
      measureText: () => ({ width: 80 }),
      beginPath() {},
      roundRect() {},
      fill() {},
      fillText() {},
    } as unknown as CanvasRenderingContext2D)
    const labelsFor = (mode: ViewMode) =>
      buildRoomGroup(sampleRoom, mode).children.filter(
        (object): object is THREE.Sprite => object instanceof THREE.Sprite
      )
    const desktop = labelsFor("3d")
    const vr = labelsFor("vr")
    expect(vr.length).toBe(sampleRoom.rooms.length)
    expect(desktop.every((label) => !label.material.depthTest)).toBe(true)
    for (const label of vr) {
      expect(label.material.depthTest).toBe(true)
      expect(label.scale.y).toBeCloseTo(0.15)
    }
  })

  it("starts with a hidden 3D grid whose segments stay inside the floor outline", () => {
    const room = buildRoomGroup(plan, "3d", undefined, { overview: true })
    const grid = room.getObjectByName("placement-grid") as THREE.LineSegments
    expect(grid.visible).toBe(false)
    const positions = grid.geometry.getAttribute("position")
    expect(positions.count).toBeGreaterThan(0)
    for (let i = 0; i < positions.count; i += 2) {
      const x = (positions.getX(i) + positions.getX(i + 1)) / 2 + 5.2
      const z = (positions.getZ(i) + positions.getZ(i + 1)) / 2 + 3.2
      expect(x > 7.9 && z > 3.4).toBe(false)
      expect(x > 6.4 && z > 5).toBe(false)
    }
    expect(
      buildRoomGroup(plan, "vr").getObjectByName("placement-grid")
    ).toBeUndefined()
  })
})

describe("architectural plan", () => {
  it("shows windows above the cut and the swing of closed doors while keeping the placement grid hidden", () => {
    const room = buildRoomGroup({ ...sampleRoom, rooms: [] }, "2d")
    const grid = room.getObjectByName("placement-grid")!
    expect(grid.visible).toBe(false)
    const windows = sampleRoom.openings.filter(
      (opening) => opening.type === "window"
    )
    for (const window of windows) {
      const frame = room.getObjectByName(window.id)!
      expect(frame, window.id).toBeDefined()
      const extent = new THREE.Box3()
        .setFromObject(frame)
        .getSize(new THREE.Vector3())
      expect(Math.max(extent.x, extent.z)).toBeCloseTo(
        window.to - window.from,
        2
      )
    }
    for (const door of room.userData.doors as DoorState[]) {
      expect(door.hinge.rotation.y).toBe(0)
      const swing = door.local.getObjectByName("door-swing")
      expect(swing).toBeInstanceOf(THREE.Line)
      expect(
        new THREE.Box3().setFromObject(swing!).getSize(new THREE.Vector3()).z
      ).toBeGreaterThan(0.3)
    }
  })

  it("puts room labels on free floor when the center is occupied", () => {
    using context = vi.spyOn(HTMLCanvasElement.prototype, "getContext")
    context.mockReturnValue({
      measureText: () => ({ width: 80 }),
      beginPath() {},
      roundRect() {},
      fill() {},
      fillText() {},
    } as unknown as CanvasRenderingContext2D)
    const bedroom = sampleRoom.rooms.find((room) => room.name === "안방")!
    const bed = {
      ...sampleProject.furniture.find(
        (item) => item.catalogId === "bed-linen"
      )!,
      x: 1.6,
      z: 4.7,
    }
    const model = { ...sampleRoom, rooms: [bedroom] }
    const scene = buildRoomGroup(model, "2d")
    updatePlanLabels(scene, model, [bed])
    const label = scene.children.find((obj) => obj instanceof THREE.Sprite)!
    expect(
      overlaps(footprint(bed)!, {
        center: [
          label.position.x + sampleRoom.bounds.width / 2,
          label.position.z + sampleRoom.bounds.depth / 2,
        ],
        x: [1, 0],
        z: [0, 1],
        width: label.scale.x / 2,
        depth: label.scale.y / 2,
      })
    ).toBe(false)
    const shifted = label.position.clone()
    updatePlanLabels(scene, model, [])
    expect(label.position.distanceTo(shifted)).toBeGreaterThan(0.2)
  })

  it("labels the room name and floor area in square meters", () => {
    const texts: string[] = []
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      measureText: () => ({ width: 80 }),
      beginPath() {},
      roundRect() {},
      fill() {},
      fillText(text: string) {
        texts.push(text)
      },
    } as unknown as CanvasRenderingContext2D)
    try {
      buildRoomGroup(sampleRoom, "2d")
      expect(texts).toContain("안방")
      expect(texts).toContain("10.9 m²")
    } finally {
      vi.restoreAllMocks()
    }
  })
})

it.each(["2d", "3d", "vr"] as const)(
  "uses saved dimensions for a %s scene without structural geometry",
  (mode) => {
    const dimensions = { width: 9.2, depth: 3.8, height: 3.2 }
    const shell = buildDimensionRoom(mode, dimensions)
    const size = new THREE.Box3()
      .setFromObject(shell.getObjectByName("room-floor")!)
      .getSize(new THREE.Vector3())
    expect(size.x).toBeCloseTo(dimensions.width)
    expect(size.z).toBeCloseTo(dimensions.depth)
    if (mode !== "2d")
      expect(new THREE.Box3().setFromObject(shell).max.y).toBeCloseTo(
        dimensions.height
      )
  }
)
