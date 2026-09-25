import type { CatalogItem } from "./types"

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("가구 규격은 객체여야 합니다.")
  }
  return value as Record<string, unknown>
}

export function parseFurnitureCatalog(value: unknown): CatalogItem[] {
  const source = record(value)
  if (
    source.version !== 1 ||
    source.unit !== "m" ||
    source.priceKind !== "example" ||
    source.currency !== "KRW" ||
    !Array.isArray(source.items) ||
    source.items.length === 0
  ) {
    throw new Error("지원하지 않는 가구 규격 형식입니다.")
  }
  const ids = new Set<string>()
  return source.items.map((value) => {
    const item = record(value)
    for (const field of ["id", "name", "description"]) {
      if (typeof item[field] !== "string" || !item[field].trim()) {
        throw new Error(`가구 ${field}가 비어 있습니다.`)
      }
    }
    const id = item.id as string
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || ids.has(id)) {
      throw new Error(`중복되거나 잘못된 가구 ID: ${id}`)
    }
    ids.add(id)
    for (const field of ["width", "depth"]) {
      if (
        typeof item[field] !== "number" ||
        !Number.isFinite(item[field]) ||
        item[field] <= 0
      ) {
        throw new Error(`가구 ${id}의 ${field}는 양수여야 합니다.`)
      }
    }
    if (
      typeof item.category !== "string" ||
      !["소파", "테이블", "의자", "장식"].includes(item.category) ||
      typeof item.color !== "string" ||
      !/^#[0-9a-fA-F]{6}$/.test(item.color) ||
      typeof item.price !== "number" ||
      !Number.isSafeInteger(item.price) ||
      item.price < 0 ||
      (item.modelUrl !== undefined &&
        (typeof item.modelUrl !== "string" ||
          !/^\/models\/[a-z0-9-]+\.glb$/.test(item.modelUrl)))
    ) {
      throw new Error(`가구 ${id}의 표시 정보가 올바르지 않습니다.`)
    }
    return { ...item } as CatalogItem
  })
}
