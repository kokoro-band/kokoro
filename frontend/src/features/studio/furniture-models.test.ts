import * as THREE from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"

import { catalog } from "./data"
import { makeFallbackModel } from "./furniture-fallback"
import { upgradeFurnitureModel } from "./furniture-models"
import type { CatalogItem } from "./types"

function fallback(item: CatalogItem) {
  return makeFallbackModel(
    { ...item, id: "placed-1", catalogId: item.id, x: 2, z: 2, rotation: 0 },
    item
  )
}

afterEach(() => vi.restoreAllMocks())

describe("editable model fallback", () => {
  it.each(catalog)("keeps $id within its exact catalog footprint", (item) => {
    const size = new THREE.Box3()
      .setFromObject(fallback(item))
      .getSize(new THREE.Vector3())
    expect(size.x).toBeCloseTo(item.width, 6)
    expect(size.z).toBeCloseTo(item.depth, 6)
  })

  it("preserves the selectable fallback after GLB failure and retries on the next request", async () => {
    const load = vi
      .spyOn(GLTFLoader.prototype, "load")
      .mockImplementation((_url, _onLoad, _onProgress, onError) => {
        queueMicrotask(() => onError?.(new Error("404")))
      })
    const item = { ...catalog[0], modelUrl: "/models/missing.glb" }
    const group = new THREE.Group()
    const original = fallback(item)
    group.add(original)
    group.userData.furnitureId = "placed-1"
    const dispose = vi.fn()
    const onLoaded = vi.fn()
    expect(
      await upgradeFurnitureModel(group, item, () => true, dispose, onLoaded)
    ).toBe(false)
    expect(group.children).toEqual([original])
    expect(group.userData.furnitureId).toBe("placed-1")
    group.position.set(3, 0, 4)
    expect(group.position.toArray()).toEqual([3, 0, 4])
    expect(dispose).not.toHaveBeenCalled()
    expect(onLoaded).not.toHaveBeenCalled()
    await upgradeFurnitureModel(group, item, () => true, dispose, onLoaded)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it("does not replace a detached project's model when a late load succeeds", async () => {
    vi.spyOn(GLTFLoader.prototype, "load").mockImplementation(
      (_url, onLoad) => {
        const scene = new THREE.Group()
        scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)))
        queueMicrotask(() => onLoad({ scene } as Parameters<typeof onLoad>[0]))
      }
    )
    const item = { ...catalog[0], modelUrl: "/models/obsolete.glb" }
    const group = new THREE.Group()
    const original = fallback(item)
    group.add(original)
    expect(
      await upgradeFurnitureModel(group, item, () => false, vi.fn(), vi.fn())
    ).toBe(false)
    expect(group.children).toEqual([original])
  })
})
