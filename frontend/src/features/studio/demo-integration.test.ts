import * as THREE from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { loadFurnitureModel } from "./furniture-models"
import { shortcuts } from "./shortcuts"

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe("main demo integration", () => {
  it("reserves bare digits for cursor tools and Alt+digits for screen navigation", () => {
    expect(shortcuts.viewStructure.keys).toEqual(["alt+1"])
    expect(shortcuts.viewArrange.keys).toEqual(["alt+2"])
    expect(shortcuts.viewSummary.keys).toEqual(["alt+3"])
  })

  it.each(["/", "/kokoro/"])("loads catalog models under the %s deployment base", async (base) => {
    vi.stubEnv("BASE_URL", base)
    const load = vi.spyOn(GLTFLoader.prototype, "load").mockImplementation((_url, onLoad) => {
      const scene = new THREE.Group()
      scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)))
      queueMicrotask(() => onLoad({ scene } as Parameters<typeof onLoad>[0]))
    })
    await loadFurnitureModel("/models/base-contract.glb")
    expect(load).toHaveBeenCalledWith(base + "models/base-contract.glb", expect.any(Function), undefined, expect.any(Function))
  })
})
