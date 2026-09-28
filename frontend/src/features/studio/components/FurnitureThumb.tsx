import type { CSSProperties } from "react"
import { Armchair, Flower2, Sofa, Table2 } from "lucide-react"

import type { Category } from "@/features/studio/types"

const glyphs = {
  소파: Sofa,
  테이블: Table2,
  의자: Armchair,
  장식: Flower2,
} satisfies Record<Exclude<Category, "전체">, typeof Sofa>

/**
 * 가구 목록의 썸네일입니다. UI 아이콘이 아니라 상품을 대신 보여 주는 이미지이므로
 * 제품의 색을 입힌 그림으로 표시합니다.
 */
export function FurnitureThumb({
  category,
  color,
  size = "medium",
}: {
  category: Exclude<Category, "전체">
  color: string
  size?: "medium" | "large"
}) {
  const Glyph = glyphs[category]
  return (
    <span
      className={`furniture-thumb furniture-thumb-${size}`}
      style={{ "--thumb-color": color } as CSSProperties}
      aria-hidden="true"
    >
      <Glyph strokeWidth={1.5} />
    </span>
  )
}
