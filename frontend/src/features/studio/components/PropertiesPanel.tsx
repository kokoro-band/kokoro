import { Minus, Plus, RotateCw, Settings2, Trash2 } from "lucide-react"
import { ActionButton, Icon, Slider } from "@seed-design/react"

import type { Furniture } from "@/features/studio/types"

import { FurnitureIcon } from "./FurnitureIcon"

export function PropertiesPanel({
  selected,
  onUpdate,
  onDelete,
}: {
  selected?: Furniture
  onUpdate: (update: Partial<Furniture>) => void
  onDelete: () => void
}) {
  return (
    <div className="properties">
      <div className="properties-heading">
        <h3>
          <Settings2 size={16} />
          선택한 가구
        </h3>
        {selected && (
          <ActionButton
            className="icon-button danger"
            variant="criticalSolid"
            size="small"
            layout="iconOnly"
            aria-label="선택한 가구 삭제"
            onClick={onDelete}
          >
            <Icon svg={<Trash2 />} size="x4" />
          </ActionButton>
        )}
      </div>
      {selected ? (
        <>
          <div className="selected-item">
            <span style={{ color: selected.color }}>
              <FurnitureIcon category={selected.category} size={28} />
            </span>
            <div>
              <strong>{selected.name}</strong>
              <span>{selected.category}</span>
            </div>
          </div>
          <div className="position-fields">
            <PositionSlider
              label="가로 위치"
              min={7}
              max={93}
              value={Math.round(selected.x)}
              onChange={(x) => onUpdate({ x })}
            />
            <PositionSlider
              label="세로 위치"
              min={8}
              max={92}
              value={Math.round(selected.z)}
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

function PositionSlider({
  label,
  min,
  max,
  value,
  onChange,
}: {
  label: string
  min: number
  max: number
  value: number
  onChange: (value: number) => void
}) {
  return (
    <label className="position-slider">
      <span>{label}</span>
      <strong>{value}%</strong>
      <Slider.Root
        min={min}
        max={max}
        step={1}
        values={[value]}
        onValuesChange={([nextValue]) => onChange(nextValue)}
        getAriaLabel={() => label}
        getAriaValuetext={(currentValue) => `${label} ${currentValue}%`}
      >
        <Slider.Control>
          <Slider.Track>
            <Slider.Range />
          </Slider.Track>
          <Slider.Thumb thumbIndex={0}>
            <Slider.HiddenInput thumbIndex={0} />
          </Slider.Thumb>
        </Slider.Control>
      </Slider.Root>
    </label>
  )
}
