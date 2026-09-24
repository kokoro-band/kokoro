import { Trash2, X } from "lucide-react"
import { ActionButton, Icon } from "@seed-design/react"

import type { Furniture } from "@/features/studio/types"

import { PropertiesPanel } from "./PropertiesPanel"

export function SelectionPanel({
  selected,
  bounds,
  onUpdate,
  onDelete,
  onClose,
}: {
  selected: Furniture
  bounds: { width: number; depth: number }
  onUpdate: (update: Partial<Furniture>) => void
  onDelete: () => void
  onClose: () => void
}) {
  return (
    <aside className="selection-panel" aria-label={`${selected.name} 편집`}>
      <div className="selection-heading">
        <h2>{selected.name}</h2>
        <ActionButton
          className="icon-button"
          variant="ghost"
          size="small"
          layout="iconOnly"
          aria-label="가구 선택 해제"
          onClick={onClose}
        >
          <Icon svg={<X />} size="x4" />
        </ActionButton>
      </div>
      <PropertiesPanel
        selected={selected}
        bounds={bounds}
        onUpdate={onUpdate}
      />
      <div className="selection-actions">
        <ActionButton
          variant="ghost"
          color="fg.critical"
          size="small"
          onClick={onDelete}
        >
          <Trash2 size={16} /> 삭제
        </ActionButton>
      </div>
    </aside>
  )
}
