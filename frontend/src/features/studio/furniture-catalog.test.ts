/// <reference types="node" />
import { readFileSync } from "node:fs"

import { describe, expect, it } from "vite-plus/test"

import { catalog } from "./data"
import { parseFurnitureCatalog } from "./furniture-catalog"

const source = JSON.parse(
  readFileSync(
    new URL(
      "../../../../docs/contracts/furniture-catalog.json",
      import.meta.url
    ),
    "utf8"
  )
)

describe("shared furniture catalog", () => {
  it("consumes the complete shared source without changing existing footprints", () => {
    expect(catalog).toEqual(source.items)
    expect(catalog.map(({ id, width, depth }) => [id, width, depth])).toEqual([
      ["sofa-cloud", 2.2, 0.92],
      ["sofa-moss", 2.1, 0.95],
      ["table-oak", 1.25, 0.7],
      ["table-white", 1, 1],
      ["chair-shell", 0.65, 0.65],
      ["chair-sand", 0.65, 0.65],
      ["plant-olive", 0.55, 0.55],
      ["lamp-arc", 0.5, 0.5],
    ])
    for (const item of catalog) {
      if (!item.modelUrl) continue
      const bytes = readFileSync(
        new URL(`../../../public${item.modelUrl}`, import.meta.url)
      )
      expect(bytes.subarray(0, 4).toString()).toBe("glTF")
    }
  })

  it("rejects duplicate IDs", () => {
    expect(() =>
      parseFurnitureCatalog({
        ...source,
        items: [source.items[0], source.items[0]],
      })
    ).toThrow("ID")
  })

  it.each([0, -1, NaN, Infinity, "2", null])(
    "rejects invalid dimensions %s",
    (value) => {
      for (const field of ["width", "depth"]) {
        expect(() =>
          parseFurnitureCatalog({
            ...source,
            items: [{ ...source.items[0], [field]: value }],
          })
        ).toThrow("양수")
      }
    }
  )

  it("rejects malformed display fields", () => {
    for (const patch of [
      { category: ["소파"] },
      { price: -1 },
      { color: "red" },
      { modelUrl: "https://example.com/model.glb" },
    ]) {
      expect(() =>
        parseFurnitureCatalog({
          ...source,
          items: [{ ...source.items[0], ...patch }],
        })
      ).toThrow()
    }
  })

  it("supports absent GLB URLs but rejects unsupported metadata", () => {
    const { modelUrl: _url, ...item } = source.items[0]
    expect(
      parseFurnitureCatalog({ ...source, items: [item] })[0].modelUrl
    ).toBeUndefined()
    for (const patch of [
      { version: 2 },
      { unit: "cm" },
      { priceKind: "verified" },
      { currency: "USD" },
      { items: [] },
    ]) {
      expect(() => parseFurnitureCatalog({ ...source, ...patch })).toThrow()
    }
  })
})
