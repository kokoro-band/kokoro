import { useState } from "react"
import {
  IconTrashcanLine,
  IconXmarkLine,
} from "@karrotmarket/react-monochrome-icon"
import { ActionButton, Icon, PrefixIcon } from "@seed-design/react"
import { Slider } from "seed-design/ui/slider"

import { Type } from "@/components/kokoro/Type"
import { catalog } from "@/features/studio/data"
import { formatPrice } from "@/features/studio/format"
import type { Furniture } from "@/features/studio/types"

import { FurnitureThumb } from "./FurnitureThumb"
import { MeterField } from "./MeterField"

export function FurnitureInspector({
  selected,
  bounds,
  roomName,
  onPlace,
  onPreview,
  onCommitPreview,
  onDelete,
  onClose,
}: {
  selected: Furniture
  bounds: { width: number; depth: number }
  roomName: string | null
  /** 입력한 위치로 옮기고, 방 안쪽으로 맞췄다면 true를 돌려줍니다. */
  onPlace: (update: { x?: number; z?: number }) => boolean
  onPreview: (update: Partial<Furniture>) => void
  onCommitPreview: () => void
  onDelete: () => void
  onClose?: () => void
}) {
  const item = catalog.find((entry) => entry.id === selected.catalogId)
  const [adjusted, setAdjusted] = useState(false)
  const place = (update: { x?: number; z?: number }) =>
    setAdjusted(onPlace(update))

  return (
    <div className="inspector-form">
      <header className="inspector-identity">
        <FurnitureThumb
          category={selected.category}
          color={selected.color}
          size="large"
        />
        <div className="inspector-identity-text">
          <Type variant="title" as="h2" maxLines={2} title={selected.name}>
            {selected.name}
          </Type>
          <Type variant="caption" numeric maxLines={1}>
            {item
              ? `${formatPrice(item.price)} · ${item.width} × ${item.depth} m`
              : selected.category}
          </Type>
        </div>
        {onClose && (
          <ActionButton
            variant="ghost"
            size="small"
            layout="iconOnly"
            aria-label="선택 해제"
            onClick={onClose}
          >
            <Icon svg={<IconXmarkLine />} size="x4" />
          </ActionButton>
        )}
      </header>

      <section className="inspector-section" aria-labelledby="position-title">
        <Type variant="heading" as="h3" id="position-title">
          위치
        </Type>
        <div className="field-pair">
          <MeterField
            label="가로"
            value={selected.x}
            max={bounds.width}
            onCommit={(x) => place({ x })}
          />
          <MeterField
            label="세로"
            value={selected.z}
            max={bounds.depth}
            onCommit={(z) => place({ z })}
          />
        </div>
        <Type variant="caption" as="p" role="status">
          {adjusted
            ? `${roomName ?? "집"} 밖으로는 옮길 수 없어서 가장 가까운 안쪽 자리에 두었어요.`
            : "평면도 왼쪽 위 모서리에서 잰 거리예요."}
        </Type>
      </section>

      <section className="inspector-section" aria-labelledby="rotation-title">
        <div className="inspector-section-heading">
          <Type variant="heading" as="h3" id="rotation-title">
            방향
          </Type>
          <Type variant="label" numeric>
            {selected.rotation}°
          </Type>
        </div>
        <Slider
          min={0}
          max={345}
          step={15}
          values={[selected.rotation]}
          markers={[
            { value: 0, label: "0°" },
            { value: 90, label: "90°" },
            { value: 180, label: "180°" },
            { value: 270, label: "270°" },
          ]}
          getAriaLabel={() => "가구 방향"}
          getAriaValuetext={(value) => `${value}도`}
          hideValueIndicator
          onValuesChange={([rotation]) => onPreview({ rotation })}
          onValuesCommit={onCommitPreview}
          // 키보드로 바꾼 값은 손을 뗄 때 한 번에 기록합니다.
          onKeyUp={onCommitPreview}
        />
      </section>

      <footer className="inspector-footer">
        <ActionButton
          variant="ghost"
          size="medium"
          color="fg.critical"
          className="inspector-delete"
          onClick={onDelete}
        >
          <PrefixIcon svg={<IconTrashcanLine />} />
          가구 빼기
        </ActionButton>
      </footer>
    </div>
  )
}
