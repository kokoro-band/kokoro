import { Armchair, ArrowRight } from "lucide-react"
import { ActionButton, List } from "@seed-design/react"

import type { Furniture } from "@/features/studio/types"

import { FurnitureIcon } from "./FurnitureIcon"

export function PlacedFurnitureList({
  furniture,
  selectedId,
  onSelect,
  onOpenCatalog,
}: {
  furniture: Furniture[]
  selectedId: string | null
  onSelect: (id: string) => void
  onOpenCatalog: () => void
}) {
  return (
    <div className="placed-list">
      {furniture.length === 0 ? (
        <div className="placed-empty">
          <Armchair size={24} aria-hidden="true" />
          <strong>아직 배치한 가구가 없어요</strong>
          <p>가구를 추가하면 여기서 빠르게 다시 선택할 수 있어요.</p>
          <ActionButton
            variant="neutralOutline"
            size="small"
            onClick={onOpenCatalog}
          >
            가구 살펴보기 <ArrowRight size={15} />
          </ActionButton>
        </div>
      ) : (
        <List.Root className="placed-items">
          {furniture.map((item) => (
            <List.Item
              key={item.id}
              className="placed-item"
              highlighted={selectedId === item.id}
            >
              <List.Prefix>
                <span
                  className="placed-item-icon"
                  style={{ color: item.color }}
                >
                  <FurnitureIcon category={item.category} size={24} />
                </span>
              </List.Prefix>
              <List.Content asChild>
                <button
                  type="button"
                  aria-pressed={selectedId === item.id}
                  onClick={() => onSelect(item.id)}
                >
                  <List.Title>{item.name}</List.Title>
                  <List.Detail>
                    위치 {item.x.toFixed(1)} × {item.z.toFixed(1)} m
                  </List.Detail>
                </button>
              </List.Content>
            </List.Item>
          ))}
        </List.Root>
      )}
    </div>
  )
}
