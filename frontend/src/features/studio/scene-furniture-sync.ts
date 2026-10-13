import type { Furniture } from "./types"

/** Fields that change a model's mesh. Position and rotation only move it. */
export function furnitureModelKey(item: Furniture) {
  return `${item.catalogId}|${item.category}|${item.color}`
}

/**
 * Compares the models already in the scene (id to model key) with the next
 * furniture list. A drag only changes poses, so its frames rebuild nothing.
 */
export function planFurnitureSync(
  built: ReadonlyMap<string, string>,
  furniture: readonly Furniture[]
) {
  const next = new Set(furniture.map((item) => item.id))
  const rebuild: Furniture[] = []
  const place: Furniture[] = []
  for (const item of furniture) {
    if (built.get(item.id) === furnitureModelKey(item)) place.push(item)
    else rebuild.push(item)
  }
  const remove = [...built.keys()].filter((id) => !next.has(id))
  return { rebuild, place, remove }
}
