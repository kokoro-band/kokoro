import { IconReceiptLine } from "@karrotmarket/react-monochrome-icon"
import { ActionButton, Icon } from "@seed-design/react"
import { List, ListItem } from "seed-design/ui/list"
import { ResultSection } from "seed-design/ui/result-section"

import { Type } from "@/components/kokoro/Type"
import { formatMeters, formatPrice } from "@/features/studio/format"
import {
  furniturePrice,
  projectTotal,
  roomForFurniture,
} from "@/features/studio/house-navigation"
import type { Project } from "@/features/studio/types"

import { FurnitureThumb } from "./FurnitureThumb"

export function SummaryView({
  project,
  onEnterRoom,
  onStartArranging,
  onOpenStructure,
}: {
  project: Project
  onEnterRoom: (index: number) => void
  onStartArranging: () => void
  onOpenStructure: () => void
}) {
  const rooms = project.room?.rooms ?? []
  const groups = [
    ...rooms.map((room, index) => ({ name: room.name, index })),
    { name: "방 밖에 놓인 가구", index: -1 },
  ]
    .map((group) => {
      const items = project.furniture.filter(
        (item) => roomForFurniture(rooms, item) === group.index
      )
      return {
        ...group,
        items,
        subtotal: items.reduce((sum, item) => sum + furniturePrice(item), 0),
      }
    })
    .filter((group) => group.items.length > 0)

  if (project.furniture.length === 0) {
    return (
      <div className="view-empty">
        <ResultSection
          asset={
            <span className="result-asset">
              <Icon svg={<IconReceiptLine />} size="x8" />
            </span>
          }
          title="아직 놓은 가구가 없어요"
          description="방에 가구를 놓으면 방별 목록과 예상 비용을 여기서 모아 볼 수 있어요."
          primaryActionProps={
            rooms.length
              ? { children: "가구 놓으러 가기", onClick: onStartArranging }
              : { children: "구조부터 잡기", onClick: onOpenStructure }
          }
        />
      </div>
    )
  }

  return (
    <div className="summary">
      <header className="summary-header">
        <div className="summary-heading">
          <Type variant="display" as="h1">
            가구 내역
          </Type>
          <Type variant="description" as="p">
            방마다 놓은 가구와 예상 비용을 모아 봤어요.
          </Type>
        </div>
        <dl className="summary-total">
          <Type variant="caption" as="dt">
            예상 가구 비용
          </Type>
          <Type variant="title" as="dd" numeric>
            {formatPrice(projectTotal(project))}
          </Type>
          <Type variant="caption" as="dd">
            가구 {project.furniture.length}개 · 방{" "}
            {groups.filter((group) => group.index >= 0).length}곳
          </Type>
        </dl>
      </header>

      {groups.map((group) => (
        <section
          className="summary-group"
          key={group.index}
          aria-labelledby={`summary-group-${group.index}`}
        >
          <header className="summary-group-header">
            <div>
              <Type
                variant="heading"
                as="h2"
                id={`summary-group-${group.index}`}
              >
                {group.name}
              </Type>
              <Type variant="caption" numeric>
                가구 {group.items.length}개 · {formatPrice(group.subtotal)}
              </Type>
            </div>
            {group.index >= 0 && (
              <ActionButton
                variant="neutralWeak"
                size="small"
                onClick={() => onEnterRoom(group.index)}
              >
                이 방 배치하기
              </ActionButton>
            )}
          </header>
          <List>
            {group.items.map((item) => (
              <ListItem
                key={item.id}
                prefix={
                  <FurnitureThumb category={item.category} color={item.color} />
                }
                title={item.name}
                detail={`${item.category} · ${formatMeters(item.x)} × ${formatMeters(item.z)}`}
                suffix={
                  <Type variant="label" numeric>
                    {formatPrice(furniturePrice(item))}
                  </Type>
                }
              />
            ))}
          </List>
        </section>
      ))}

      <Type variant="caption" as="p" className="summary-note">
        가격은 예제 카탈로그 기준이에요. 실제 판매 가격과 다를 수 있어요.
      </Type>
    </div>
  )
}
