import { Minus, Move, Plus, RotateCw, Settings2, Trash2 } from "lucide-react"

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
                min={7}
                max={93}
                value={Math.round(selected.x)}
                onChange={(event) =>
                  onUpdate({
                    x: Math.min(93, Math.max(7, Number(event.target.value))),
                  })
                }
              />
              <span>%</span>
            </label>
            <label>
              세로 위치
              <input
                type="number"
                min={8}
                max={92}
                value={Math.round(selected.z)}
                onChange={(event) =>
                  onUpdate({
                    z: Math.min(92, Math.max(8, Number(event.target.value))),
                  })
                }
              />
              <span>%</span>
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
