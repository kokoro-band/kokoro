import { Armchair, ListFilter } from "lucide-react"
import { Tabs } from "@seed-design/react"

import type { Category, Furniture } from "@/features/studio/types"

import { FurnitureLibrary } from "./FurnitureLibrary"
import { PlacedFurnitureList } from "./PlacedFurnitureList"

export function LibraryPanel({
  tab,
  category,
  furniture,
  selectedId,
  onTabChange,
  onCategoryChange,
  onAddFurniture,
  onSelectFurniture,
}: {
  tab: "furniture" | "placed"
  category: Category
  furniture: Furniture[]
  selectedId: string | null
  onTabChange: (tab: "furniture" | "placed") => void
  onCategoryChange: (category: Category) => void
  onAddFurniture: (catalogId: string) => void
  onSelectFurniture: (id: string) => void
}) {
  return (
    <aside className="library-panel">
      <Tabs.Root
        className="panel-tabs"
        value={tab}
        onValueChange={(value) => onTabChange(value as typeof tab)}
        triggerLayout="fill"
      >
        <Tabs.List aria-label="가구 보기">
          <Tabs.Trigger value="furniture">
            <Armchair size={16} />
            가구 추가
          </Tabs.Trigger>
          <Tabs.Trigger value="placed">
            <ListFilter size={16} />
            배치한 가구
          </Tabs.Trigger>
          <Tabs.Indicator />
        </Tabs.List>
      </Tabs.Root>
      {tab === "furniture" ? (
        <FurnitureLibrary
          category={category}
          onCategoryChange={onCategoryChange}
          onAddFurniture={onAddFurniture}
        />
      ) : (
        <PlacedFurnitureList
          furniture={furniture}
          selectedId={selectedId}
          onSelect={onSelectFurniture}
          onOpenCatalog={() => onTabChange("furniture")}
        />
      )}
    </aside>
  )
}
