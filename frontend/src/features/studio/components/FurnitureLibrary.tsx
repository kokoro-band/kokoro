import type { CSSProperties } from "react"
import { Box, Plus } from "lucide-react"

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
        <h2>공간에 더할 것들</h2>
        <p>가구를 선택해 방에 배치해 보세요.</p>
      </div>
      <div className="category-list" aria-label="가구 종류">
        {categories.map((entry) => (
          <button
            key={entry}
            className={category === entry ? "active" : ""}
            aria-pressed={category === entry}
            onClick={() => onCategoryChange(entry)}
          >
            {entry}
          </button>
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
              <div
                className="catalog-visual"
                style={{ "--item-color": item.color } as CSSProperties}
              >
                <FurnitureIcon category={item.category} size={46} />
                <span className="add-icon">
                  <Plus size={14} />
                </span>
              </div>
              <strong>{item.name}</strong>
              <span>{item.description}</span>
              <div className="catalog-meta">
                <span>
                  {Math.round(item.width * 100)} ×{" "}
                  {Math.round(item.depth * 100)}
                  cm
                </span>
                <b>₩{money.format(item.price)}</b>
              </div>
            </button>
          ))}
      </div>
      <div className="library-footnote">
        <Box size={14} />
        <span>
          규격 기반 기본 모델입니다.
          <br />
          실제 제품 모델은 추후 연결됩니다.
        </span>
      </div>
    </>
  )
}
