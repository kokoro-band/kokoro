import { Chip, List } from "@seed-design/react"

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
      <List.Root className="catalog-grid">
        {catalog
          .filter((item) => category === "전체" || item.category === category)
          .map((item) => (
            <List.Item className="catalog-item" key={item.id}>
              <List.Prefix>
                <span className="catalog-visual" style={{ color: item.color }}>
                  <FurnitureIcon category={item.category} size={24} />
                </span>
              </List.Prefix>
              <List.Content asChild>
                <button type="button" onClick={() => onAddFurniture(item.id)}>
                  <List.Title>{item.name}</List.Title>
                  <List.Detail>₩{money.format(item.price)}</List.Detail>
                </button>
              </List.Content>
            </List.Item>
          ))}
      </List.Root>
    </>
  )
}
