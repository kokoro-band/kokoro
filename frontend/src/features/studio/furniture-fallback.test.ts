import { Raycaster, Vector3 } from "three"
import { expect, it } from "vite-plus/test"
import { makeFallbackModel } from "./furniture-fallback"

it.each([
  { id: "bed-linen", category: "침대", width: 1.6, depth: 2.1 },
  { id: "storage-open", category: "수납", width: 0.9, depth: 0.35 },
] as const)(
  "keeps the top of a $category pickable across its footprint before the model loads",
  (item) => {
    const entry = {
      ...item,
      color: "#986842",
      description: "",
      price: 0,
      name: item.id,
    }
    const model = makeFallbackModel(
      {
        ...entry,
        id: "placed",
        catalogId: item.id,
        rotation: 0,
        x: 0,
        z: 0,
      },
      entry
    )
    model.updateMatrixWorld(true)
    const ray = new Raycaster(
      new Vector3(item.width * 0.42, 3, item.depth * 0.36),
      new Vector3(0, -1, 0)
    )
    expect(ray.intersectObject(model).length).toBeGreaterThan(0)
  }
)
