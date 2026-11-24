import { useState, type CSSProperties } from "react"
import {
  Archive,
  Armchair,
  BedDouble,
  Flower2,
  Sofa,
  Table2,
} from "lucide-react"

import { catalog } from "@/features/studio/data"
import type { Category } from "@/features/studio/types"

const glyphs = {
  소파: Sofa,
  테이블: Table2,
  의자: Armchair,
  침대: BedDouble,
  수납: Archive,
  장식: Flower2,
} satisfies Record<Exclude<Category, "전체">, typeof Sofa>

/**
 * 배치 화면과 같은 모델로 만든 썸네일입니다. 없는 이미지는 가구 종류와 색으로 표시합니다.
 */
export function FurnitureThumb({
  catalogId,
  category,
  color,
  size = "medium",
}: {
  catalogId: string
  category: Exclude<Category, "전체">
  color: string
  size?: "medium" | "large"
}) {
  const [failedImage, setFailedImage] = useState<string | null>(null)
  const thumbnail = catalog.some(
    (item) => item.id === catalogId && item.modelUrl
  )
    ? `${import.meta.env.BASE_URL}models/thumbnails/${catalogId}.webp`
    : null
  const Glyph = glyphs[category]
  return (
    <span
      className={`furniture-thumb furniture-thumb-${size}`}
      style={{ "--thumb-color": color } as CSSProperties}
      aria-hidden="true"
    >
      {thumbnail && thumbnail !== failedImage ? (
        <img
          src={thumbnail}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailedImage(thumbnail)}
        />
      ) : (
        <Glyph strokeWidth={1.5} />
      )}
    </span>
  )
}
