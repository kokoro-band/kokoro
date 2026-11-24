import * as THREE from "three"
import { describe, expect, it } from "vite-plus/test"

import {
  animateDoors,
  buildRoomGroup,
  setManualDoorStates,
  type DoorState,
} from "./room-geometry"
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
  const doors = group.userData.doors as DoorState[]
  const door = doors[0]
  if (mode !== "vr") {
    setManualDoorStates(doors, { door: true })
    animateDoors(doors, null, 1)
  }
  group.updateMatrixWorld(true)
  const leaf = door.hinge.getWorldPosition(new THREE.Vector3())
  const tip = door.hinge.localToWorld(new THREE.Vector3(0.5, 0, 0))
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
