import { Minus, Plus, RotateCw } from "lucide-react"
import { ActionButton, Field, Icon, TextField } from "@seed-design/react"

import { catalog } from "@/features/studio/data"
import type { Furniture } from "@/features/studio/types"

import { FurnitureIcon } from "./FurnitureIcon"

const money = new Intl.NumberFormat("ko-KR")

function clamp(value: number, max: number) {
  if (!Number.isFinite(value)) return 0
  return Math.min(max, Math.max(0, Math.round(value * 10) / 10))
}

export function PropertiesPanel({
  selected,
  bounds,
  onUpdate,
}: {
  selected?: Furniture
  bounds: { width: number; depth: number }
  onUpdate: (update: Partial<Furniture>) => void
}) {
  const catalogItem = selected
    ? catalog.find((item) => item.id === selected.catalogId)
    : undefined

  return (
    <div className="properties">
      {selected ? (
        <>
          <div className="selected-item">
            <span
              className="selected-item-icon"
              style={{ color: selected.color }}
            >
              <FurnitureIcon category={selected.category} size={24} />
            </span>
            <div>
              <strong>{selected.name}</strong>
              <span>
                {catalogItem
                  ? `₩${money.format(catalogItem.price)}`
                  : selected.category}
              </span>
            </div>
          </div>
          <div className="position-fields">
            <MeterField
              label="가로 위치"
              max={bounds.width}
              value={selected.x}
              onChange={(x) => onUpdate({ x })}
            />
            <MeterField
              label="세로 위치"
              max={bounds.depth}
              value={selected.z}
              onChange={(z) => onUpdate({ z })}
            />
          </div>
          <div className="rotation-control">
            <span>회전</span>
            <ActionButton
              className="icon-button"
              variant="neutralWeak"
              size="small"
              layout="iconOnly"
              aria-label="15도 왼쪽 회전"
              onClick={() =>
                onUpdate({ rotation: (selected.rotation - 15 + 360) % 360 })
              }
            >
              <Icon svg={<Minus />} size="x4" />
            </ActionButton>
            <strong>{selected.rotation}°</strong>
            <ActionButton
              className="icon-button"
              variant="neutralWeak"
              size="small"
              layout="iconOnly"
              aria-label="15도 오른쪽 회전"
              onClick={() =>
                onUpdate({ rotation: (selected.rotation + 15) % 360 })
              }
            >
              <Icon svg={<Plus />} size="x4" />
            </ActionButton>
            <ActionButton
              className="icon-button"
              variant="neutralWeak"
              size="small"
              layout="iconOnly"
              aria-label="회전 초기화"
              onClick={() => onUpdate({ rotation: 0 })}
            >
              <Icon svg={<RotateCw />} size="x4" />
            </ActionButton>
          </div>
        </>
      ) : (
        <div className="selection-empty">
          <p>가구를 선택하면 위치와 회전을 조절할 수 있어요.</p>
        </div>
      )}
    </div>
  )
}

function MeterField({
  label,
  max,
  value,
  onChange,
}: {
  label: string
  max: number
  value: number
  onChange: (value: number) => void
}) {
  return (
    <Field.Root className="position-field">
      <Field.Label>{label}</Field.Label>
      <TextField.Root size="medium">
        <TextField.Input
          type="number"
          min={0}
          max={max}
          step={0.1}
          value={value.toFixed(1)}
          onChange={(event) => onChange(clamp(Number(event.target.value), max))}
        />
        <TextField.SuffixText>m</TextField.SuffixText>
      </TextField.Root>
    </Field.Root>
  )
}
