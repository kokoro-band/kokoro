import { Chip } from "@seed-design/react"

import { catalog } from "@/features/studio/data"
import type { Category } from "@/features/studio/types"

import { FurnitureIcon } from "./FurnitureIcon"

const categories: Category[] = ["전체", "소파", "테이블", "의자", "장식"]
const money = new Intl.NumberFormat("ko-KR")

export function FurnitureLibrary({
  category,
  onCategoryChange,
  onAddFurniture,
}: {
  category: Category
  onCategoryChange: (category: Category) => void
  onAddFurniture: (catalogId: string) => void
}) {
  return (
    <>
      <div className="library-heading">
        <h2>가구</h2>
      </div>
      <div className="category-list" aria-label="가구 종류">
        {categories.map((entry) => (
          <Chip.Root
            key={entry}
            aria-pressed={category === entry}
            variant={category === entry ? "solid" : "outlineWeak"}
            size="small"
            onClick={() => onCategoryChange(entry)}
          >
            <Chip.Label>{entry}</Chip.Label>
          </Chip.Root>
        ))}
      </div>
      <div className="catalog-grid">
        {catalog
          .filter((item) => category === "전체" || item.category === category)
          .map((item) => (
            <button
              className="catalog-card"
              key={item.id}
              onClick={() => onAddFurniture(item.id)}
            >
              <div className="catalog-visual">
                <FurnitureIcon category={item.category} size={46} />
              </div>
              <strong>{item.name}</strong>
              <span>₩{money.format(item.price)}</span>
            </button>
          ))}
      </div>
    </>
  )
}
