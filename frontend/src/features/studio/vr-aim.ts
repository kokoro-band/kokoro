import * as THREE from "three"

export type VrAim = {
  point: THREE.Vector3
  distance: number
} & ({ kind: "furniture" | "door"; id: string } | { kind: "floor" | "blocked" })

/** Raycast physical surfaces only. Labels, selection outlines and XR markers are overlays. */
export function createVrAim(
  room: THREE.Group,
  furniture: THREE.Group,
  isWalkable: (x: number, z: number) => boolean
) {
  const surfaces: THREE.Mesh[] = []
  room.traverse((part) => {
    if (part instanceof THREE.Mesh) surfaces.push(part)
  })
  const raycaster = new THREE.Raycaster()
  const hits: THREE.Intersection[] = []

  return function aim(ray: THREE.Ray, heldId: string | null): VrAim | null {
    raycaster.ray.copy(ray)
    hits.length = 0
    raycaster.intersectObjects(surfaces, false, hits)
    // Includes furniture that was loaded, added or replaced during the session.
    raycaster.intersectObject(furniture, true, hits)
    for (const { object, point, distance } of hits) {
      if (!(object instanceof THREE.Mesh)) continue
      let owner: THREE.Object3D | null = object
      while (owner && !owner.userData.furnitureId && !owner.userData.doorId) {
        owner = owner.parent
      }
      if (owner?.userData.furnitureId) {
        if (owner.userData.furnitureId === heldId) continue
        return {
          kind: "furniture",
          id: owner.userData.furnitureId,
          point,
          distance,
        }
      }
      if (owner?.userData.doorId) {
        return { kind: "door", id: owner.userData.doorId, point, distance }
      }
      const floor =
        object.name === "room-floor" &&
        Math.abs(point.y) < 0.001 &&
        isWalkable(point.x, point.z)
      return { kind: floor ? "floor" : "blocked", point, distance }
    }
    return null
  }
}
