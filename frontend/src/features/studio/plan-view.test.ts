import * as THREE from "three"
import { expect, it } from "vite-plus/test"
import { catalog } from "./data"
import { fitPlanCamera, planFurnitureSymbol } from "./plan-view"

it.each(catalog)(
  "draws $id with the catalog footprint centered on the saved pose",
  (entry) => {
    const placed = {
      ...entry,
      id: "placed",
      catalogId: entry.id,
      x: 0,
      z: 0,
      rotation: 0,
    }
    const symbol = planFurnitureSymbol(placed, entry)
    const bounds = new THREE.Box3().setFromObject(symbol)
    const size = bounds.getSize(new THREE.Vector3())
    expect(size.x).toBeCloseTo(entry.width, 4)
    expect(size.z).toBeCloseTo(entry.depth, 4)
    expect(size.y).toBeLessThan(0.02)
    const center = bounds.getCenter(new THREE.Vector3())
    expect(center.x).toBeCloseTo(0, 4)
    expect(center.z).toBeCloseTo(0, 4)
  }
)

it.each([0.45, 1, 2.4])(
  "fits the entire home at viewport aspect %s and retains zoom on resize",
  (aspect) => {
    const camera = new THREE.OrthographicCamera()
    fitPlanCamera(camera, 10.4, 6.4, aspect)
    expect(camera.top - camera.bottom).toBeGreaterThan(6.4)
    expect(camera.right - camera.left).toBeGreaterThan(10.4)
    expect(
      (camera.right - camera.left) / (camera.top - camera.bottom)
    ).toBeCloseTo(aspect)
    camera.zoom = 2
    fitPlanCamera(camera, 10.4, 6.4, aspect * 0.8)
    expect(camera.zoom).toBe(2)
  }
)
