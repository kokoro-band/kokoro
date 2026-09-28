import { describe, expect, it } from "vite-plus/test"
import * as THREE from "three"
import {
  animateDoors,
  buildRoomGroup,
  createWalkableTest,
  setManualDoorStates,
  type DoorState,
} from "./room-geometry"
import { instantiateFurnitureModel } from "./furniture-models"
import { catalog } from "./data"
import type { RoomModel } from "./types"

const room: RoomModel = {
  version: 2,
  unit: "m",
  wallHeight: 2.4,
  bounds: { width: 6, depth: 6 },
  outline: [
    [0, 0],
    [6, 0],
    [6, 6],
    [0, 6],
  ],
  walls: [{ id: "wall", a: [3, 0], b: [3, 6], thickness: 0.2 }],
  openings: [
    {
      id: "door",
      wallId: "wall",
      type: "door",
      from: 2,
      to: 4,
      bottom: 0,
      top: 2.1,
    },
  ],
  rooms: [],
}
function setup() {
  const group = buildRoomGroup(room, "3d")
  group.updateMatrixWorld(true)
  const doors = group.userData.doors as DoorState[]
  const advance = (person: THREE.Vector3 | null = null) => {
    for (let i = 0; i < 20; i++) animateDoors(doors, person, 1 / 30)
  }
  return { door: doors[0], doors, advance }
}

describe("operable doors", () => {
  it("opens a manually operated door toward the floor plan swing side", () => {
    const { door, advance } = setup()
    door.manualOpen = true
    advance()
    expect(door.hinge.rotation.y).toBeCloseTo((-85 * Math.PI) / 180)
  })
  it("keeps the current door angle when switching between 2D and 3D", () => {
    const first = buildRoomGroup(room, "3d")
    const firstDoors = first.userData.doors as DoorState[]
    setManualDoorStates(firstDoors, { door: true })
    for (let i = 0; i < 20; i++) animateDoors(firstDoors, null, 1 / 30)
    const openAngle = firstDoors[0].angle

    const second = buildRoomGroup(room, "2d", new Map([["door", openAngle]]))
    const secondDoors = second.userData.doors as DoorState[]
    setManualDoorStates(secondDoors, { door: true })
    expect(secondDoors[0].hinge.rotation.y).toBeCloseTo(openAngle)
    animateDoors(secondDoors, null, 1 / 30)
    expect(secondDoors[0].angle).toBeCloseTo(openAngle)

    setManualDoorStates(secondDoors, { door: false })
    animateDoors(secondDoors, null, 1 / 30)
    const closingAngle = secondDoors[0].angle
    const third = buildRoomGroup(room, "3d", new Map([["door", closingAngle]]))
    const thirdDoors = third.userData.doors as DoorState[]
    setManualDoorStates(thirdDoors, { door: false })
    expect(thirdDoors[0].hinge.rotation.y).toBeCloseTo(closingAngle)
    animateDoors(thirdDoors, null, 1 / 30)
    expect(thirdDoors[0].angle).toBeLessThan(closingAngle)
  })
  it("starts closed and animates the actual leaf for manual open and close", () => {
    const { door, advance } = setup()
    expect(door.angle).toBe(0)
    expect(door.local.userData.doorId).toBe("door")
    door.manualOpen = true
    advance()
    expect(door.hinge.rotation.y).toBeCloseTo((85 * Math.PI) / 180)
    door.manualOpen = false
    advance()
    expect(door.hinge.rotation.y).toBe(0)
  })
  it("keeps a manually closed door closed near a VR user while automatic doors still work", () => {
    const { door, advance } = setup()
    const near = new THREE.Vector3(0.5, 1.6, 0)
    advance(near)
    expect(Math.abs(door.angle)).toBeGreaterThan(1.4)
    advance(new THREE.Vector3(5, 1.6, 0))
    expect(door.angle).toBe(0)
    door.manualOpen = false
    advance(near)
    expect(door.angle).toBe(0)
  })
  it("blocks a closed or partially opened doorway and keeps the door frame solid", () => {
    const { door, doors, advance } = setup()
    const walkable = createWalkableTest(room, doors)
    expect(walkable(0, 0)).toBe(false)
    door.manualOpen = true
    animateDoors(doors, null, 0.1)
    expect(walkable(0, 0)).toBe(false)
    advance()
    expect(walkable(0, 0)).toBe(true)
    expect(walkable(0, -0.9)).toBe(false)
    door.manualOpen = false
    advance()
    expect(walkable(0, 0)).toBe(false)
  })
  it("renders catalog dimensions even when the GLB aspect ratio differs", () => {
    const template = new THREE.Group()
    template.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)))
    template.userData.bounds = new THREE.Box3().setFromObject(template)
    const item = catalog.find((entry) => entry.id === "sofa-cloud")!
    const model = instantiateFurnitureModel(template, item)
    const size = new THREE.Box3()
      .setFromObject(model)
      .getSize(new THREE.Vector3())
    expect(size.x).toBeCloseTo(item.width)
    expect(size.z).toBeCloseTo(item.depth)
    expect(new THREE.Box3().setFromObject(model).min.y).toBeCloseTo(0)
  })
})
