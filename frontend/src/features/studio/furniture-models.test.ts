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

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe("editable model fallback", () => {
  it.each(catalog)(
    "matches $id loaded bounds to the collision footprint",
    async (item) => {
      vi.spyOn(GLTFLoader.prototype, "load").mockImplementation(
        (_url, onLoad) => {
          const scene = new THREE.Group()
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 1))
          mesh.position.set(2, 4, -3)
          scene.add(mesh)
          queueMicrotask(() =>
            onLoad({ scene } as Parameters<typeof onLoad>[0])
          )
        }
      )
      const group = new THREE.Group()
      group.add(fallback(item))
      expect(
        await upgradeFurnitureModel(group, item, () => true, vi.fn(), vi.fn())
      ).toBe(true)
      const bounds = new THREE.Box3().setFromObject(group)
      const size = bounds.getSize(new THREE.Vector3())
      const center = bounds.getCenter(new THREE.Vector3())
      expect(size.x).toBeCloseTo(item.width, 6)
      expect(size.z).toBeCloseTo(item.depth, 6)
      expect(bounds.min.y).toBeCloseTo(0, 6)
      expect(center.x).toBeCloseTo(0, 6)
      expect(center.z).toBeCloseTo(0, 6)
    }
  )

  it.each(["/", "/kokoro/"])(
    "loads catalog models under the %s deployment base",
    async (base) => {
      vi.stubEnv("BASE_URL", base)
      const load = vi
        .spyOn(GLTFLoader.prototype, "load")
        .mockImplementation((_url, onLoad) => {
          const scene = new THREE.Group()
          scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)))
          queueMicrotask(() =>
            onLoad({ scene } as Parameters<typeof onLoad>[0])
          )
        })
      const item = { ...catalog[0], modelUrl: "/models/base-contract.glb" }
      const group = new THREE.Group()
      expect(
        await upgradeFurnitureModel(group, item, () => true, vi.fn(), vi.fn())
      ).toBe(true)
      expect(load.mock.calls[0]?.[0]).toBe(base + "models/base-contract.glb")
    }
  )

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
