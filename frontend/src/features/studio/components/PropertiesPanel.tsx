import { Minus, Move, Plus, RotateCw, Settings2, Trash2 } from "lucide-react"

import type { Furniture } from "@/features/studio/types"

import { FurnitureIcon } from "./FurnitureIcon"

function clamp(value: number, max: number) {
  if (!Number.isFinite(value)) return 0
  return Math.min(max, Math.max(0, Math.round(value * 10) / 10))
}

export function PropertiesPanel({
  selected,
  bounds,
  onUpdate,
  onDelete,
}: {
  selected?: Furniture
  bounds: { width: number; depth: number }
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
          <button
            className="icon-button danger"
            aria-label="선택한 가구 삭제"
            onClick={onDelete}
          >
            <Trash2 size={16} />
          </button>
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
            <label>
              가로 위치
              <input
                type="number"
                min={0}
                max={bounds.width}
                step={0.1}
                value={selected.x.toFixed(1)}
                onChange={(event) =>
                  onUpdate({
                    x: clamp(Number(event.target.value), bounds.width),
                  })
                }
              />
              <span>m</span>
            </label>
            <label>
              세로 위치
              <input
                type="number"
                min={0}
                max={bounds.depth}
                step={0.1}
                value={selected.z.toFixed(1)}
                onChange={(event) =>
                  onUpdate({
                    z: clamp(Number(event.target.value), bounds.depth),
                  })
                }
              />
              <span>m</span>
            </label>
          </div>
          <div className="rotation-control">
            <span>회전</span>
            <button
              className="icon-button"
              aria-label="15도 왼쪽 회전"
              onClick={() =>
                onUpdate({ rotation: (selected.rotation - 15 + 360) % 360 })
              }
            >
              <Minus size={14} />
            </button>
            <strong>{selected.rotation}°</strong>
            <button
              className="icon-button"
              aria-label="15도 오른쪽 회전"
              onClick={() =>
                onUpdate({ rotation: (selected.rotation + 15) % 360 })
              }
            >
              <Plus size={14} />
            </button>
            <button
              className="icon-button"
              aria-label="회전 초기화"
              onClick={() => onUpdate({ rotation: 0 })}
            >
              <RotateCw size={14} />
            </button>
          </div>
        </>
      ) : (
        <div className="selection-empty">
          <Move size={24} />
          <p>
            공간에서 가구를 선택하면
            <br />
            위치와 회전을 조절할 수 있어요.
          </p>
        </div>
      )}
    </div>
  )
}
