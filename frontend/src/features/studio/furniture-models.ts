import * as THREE from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"

import type { CatalogItem } from "./types"

const loader = new GLTFLoader()
const templates = new Map<string, Promise<THREE.Group>>()

export function loadFurnitureModel(url: string) {
  // Catalog paths remain deployment-independent in the shared API contract.
  const assetUrl =
    url.startsWith("/") && !url.startsWith("//")
      ? import.meta.env.BASE_URL + url.slice(1)
      : url
  let pending = templates.get(assetUrl)
  if (!pending) {
    pending = new Promise<THREE.Group>((resolve, reject) => {
      loader.load(
        assetUrl,
        (gltf) => {
          const template = gltf.scene
          template.updateMatrixWorld(true)
          template.userData.bounds = new THREE.Box3().setFromObject(template)
          resolve(template)
        },
        undefined,
        (error) => {
          templates.delete(assetUrl)
          reject(error)
        }
      )
    })
    templates.set(assetUrl, pending)
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
  // Match both horizontal catalog dimensions used by the placement footprint.
  wrapper.scale.set(
    size.x > 0 ? item.width / size.x : 1,
    scale,
    size.z > 0 ? item.depth / size.z : 1
  )
  return wrapper
}

/** A failed or obsolete load must leave the editable fallback in place. */
export async function upgradeFurnitureModel(
  group: THREE.Group,
  item: CatalogItem,
  isCurrent: () => boolean,
  dispose: (fallback: THREE.Group) => void,
  onLoaded: () => void
) {
  if (!item.modelUrl) return false
  try {
    const template = await loadFurnitureModel(item.modelUrl)
    if (!isCurrent()) return false
    const model = instantiateFurnitureModel(template, item)
    const fallback = group.children[0] as THREE.Group | undefined
    if (fallback) {
      dispose(fallback)
      group.remove(fallback)
    }
    group.add(model)
    onLoaded()
    return true
  } catch {
    return false
  }
}
