import { describe, expect, it } from "vite-plus/test"

import { furnitureModelKey, planFurnitureSync } from "./scene-furniture-sync"
import type { Furniture } from "./types"

const sofa: Furniture = {
  id: "sofa",
  catalogId: "sofa-cloud",
  name: "소파",
  category: "소파",
  x: 1,
  z: 1,
  rotation: 0,
  color: "#ccc",
}
const chair: Furniture = {
  ...sofa,
  id: "chair",
  catalogId: "chair-shell",
  name: "의자",
  category: "의자",
}

function built(...items: Furniture[]) {
  return new Map(items.map((item) => [item.id, furnitureModelKey(item)]))
}

describe("planFurnitureSync", () => {
  it("only moves a model when its position or rotation changes", () => {
    const plan = planFurnitureSync(built(sofa, chair), [
      { ...sofa, x: 1.4, z: 0.6, rotation: 37.5 },
      chair,
    ])

    expect(plan.rebuild).toEqual([])
    expect(plan.remove).toEqual([])
    expect(plan.place.map((item) => item.id)).toEqual(["sofa", "chair"])
  })

  it("rebuilds a model whose look changes", () => {
    const plan = planFurnitureSync(built(sofa), [{ ...sofa, color: "#123" }])

    expect(plan.rebuild.map((item) => item.id)).toEqual(["sofa"])
    expect(plan.place).toEqual([])
  })

  it("builds added furniture and removes deleted furniture", () => {
    const plan = planFurnitureSync(built(sofa), [chair])

    expect(plan.rebuild.map((item) => item.id)).toEqual(["chair"])
    expect(plan.remove).toEqual(["sofa"])
  })

  it("ignores a rename, which does not change the model", () => {
    const plan = planFurnitureSync(built(sofa), [{ ...sofa, name: "큰 소파" }])

    expect(plan.rebuild).toEqual([])
  })
})
