import * as THREE from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"

import type { CatalogItem } from "./types"

const loader = new GLTFLoader()
const templates = new Map<string, Promise<THREE.Group>>()

export function loadFurnitureModel(url: string) {
  let pending = templates.get(url)
  if (!pending) {
    pending = new Promise<THREE.Group>((resolve, reject) => {
      loader.load(
        url,
        (gltf) => {
          const template = gltf.scene
          template.updateMatrixWorld(true)
          template.userData.bounds = new THREE.Box3().setFromObject(template)
          resolve(template)
        },
        undefined,
        (error) => {
          templates.delete(url)
          reject(error)
        }
      )
    })
    templates.set(url, pending)
  }
  return pending
}

export function instantiateFurnitureModel(
  template: THREE.Group,
  item: CatalogItem
) {
  const bounds = template.userData.bounds as THREE.Box3
  const size = bounds.getSize(new THREE.Vector3())
  const center = bounds.getCenter(new THREE.Vector3())
  const scale = Math.min(
    size.x > 0 ? item.width / size.x : 1,
    size.z > 0 ? item.depth / size.z : 1
  )

  const model = template.clone(true)
  model.traverse((object) => {
    object.userData.sharedAsset = true
    if (object instanceof THREE.Mesh) {
      object.castShadow = true
      object.receiveShadow = true
    }
  })

  const wrapper = new THREE.Group()
  model.position.set(-center.x, -bounds.min.y, -center.z)
  wrapper.add(model)
  wrapper.scale.setScalar(scale)
  return wrapper
}
