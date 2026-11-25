import * as THREE from "three"
import { expect, it } from "vite-plus/test"
import { buildRoomGroup, type DoorState } from "./room-geometry"
import { sampleRoom } from "./sample-room"
import { createVrAim } from "./vr-aim"

it("hits a closed door and reaches the model through the same opening after the door swings away", () => {
  const room = buildRoomGroup({ ...sampleRoom, rooms: [] }, "vr")
  const doors = room.userData.doors as DoorState[]
  const door = doors.find(({ id }) => id === "door-master")!
  const furniture = new THREE.Group()
  const chair = new THREE.Group()
  chair.userData.furnitureId = "chair"
  chair.position.copy(door.center)
  chair.position.x -= 0.7
  chair.position.y = 1
  furniture.add(chair)
  const aim = createVrAim(room, furniture, () => true)
  // The model finishes loading after the XR picker is mounted.
  chair.add(new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.5, 0.25)))
  const ray = new THREE.Ray(
    new THREE.Vector3(door.center.x + 0.7, 1, door.center.z),
    new THREE.Vector3(-1, 0, 0)
  )
  room.updateMatrixWorld(true)
  furniture.updateMatrixWorld(true)
  expect(aim(ray, null)).toMatchObject({ kind: "door", id: door.id })
  door.hinge.rotation.y = Math.PI / 2
  room.updateMatrixWorld(true)
  expect(aim(ray, null)).toMatchObject({ kind: "furniture", id: "chair" })
  expect(aim(ray, "chair")?.kind).toBe("blocked")
})

it("uses the visible floor surface and only offers a walkable destination", () => {
  const room = buildRoomGroup({ ...sampleRoom, rooms: [] }, "vr")
  const furniture = new THREE.Group()
  const ray = new THREE.Ray(
    new THREE.Vector3(0, 1.6, 1),
    new THREE.Vector3(0, -1, 0)
  )
  room.updateMatrixWorld(true)
  const hit = createVrAim(room, furniture, () => true)(ray, null)
  expect(hit?.kind).toBe("floor")
  expect(hit?.distance).toBeCloseTo(1.6)
  expect(createVrAim(room, furniture, () => false)(ray, null)?.kind).toBe(
    "blocked"
  )
  ray.origin.x = 200
  expect(createVrAim(room, furniture, () => true)(ray, null)).toBeNull()
})

it("shows the floor from above in the VR preview and the ceiling from eye level inside", () => {
  const room = buildRoomGroup({ ...sampleRoom, rooms: [] }, "vr")
  room.updateMatrixWorld(true)
  const aim = createVrAim(room, new THREE.Group(), () => true)
  const overhead = new THREE.Ray(
    new THREE.Vector3(0, 4, 1),
    new THREE.Vector3(0, -1, 0)
  )
  const upward = new THREE.Ray(
    new THREE.Vector3(0, 1.6, 1),
    new THREE.Vector3(0, 1, 0)
  )
  expect(aim(overhead, null)?.kind).toBe("floor")
  const ceiling = aim(upward, null)
  expect(ceiling?.kind).toBe("blocked")
  expect(ceiling?.point.y).toBeCloseTo(sampleRoom.wallHeight)
})
