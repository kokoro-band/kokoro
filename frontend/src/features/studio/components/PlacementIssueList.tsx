import { useId, useState } from "react"
import {
  IconChevronDownLine,
  IconChevronUpLine,
} from "@karrotmarket/react-monochrome-icon"
import { ActionButton, SuffixIcon } from "@seed-design/react"
import { Callout } from "seed-design/ui/callout"
import { List, ListButtonItem } from "seed-design/ui/list"

import { roomForFurniture } from "../house-navigation"
import type { PlacementIssue } from "../placement-issues"
import type { Furniture, RoomLabel } from "../types"

/**
 * 방을 보고 있을 때는 그 방과 지금 고른 가구의 문제만 먼저 보여 주고, 집의 나머지는
 * 한 줄로 줄여 필요할 때 펼칩니다.
 */
export function PlacementIssueList({
  furniture,
  issues,
  rooms,
  roomIndex,
  selectedId,
  onSelect,
}: {
  furniture: Furniture[]
  issues: PlacementIssue[]
  rooms: RoomLabel[]
  roomIndex: number | null
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const [othersOpen, setOthersOpen] = useState(false)
  const othersId = useId()
  if (!issues.length) return null
  const roomOf = (issue: PlacementIssue) => {
    const item = furniture.find((entry) => entry.id === issue.furnitureId)
    return item ? roomForFurniture(rooms, item) : -1
  }
  const here = issues.filter(
    (issue) =>
      roomIndex === null ||
      issue.furnitureId === selectedId ||
      roomOf(issue) === roomIndex
  )
  const others = issues.filter((issue) => !here.includes(issue))
  const row = (issue: PlacementIssue, withRoom: boolean) => (
    <ListButtonItem
      key={issue.furnitureId}
      data-furniture-id={issue.furnitureId}
      title={
        furniture.find((item) => item.id === issue.furnitureId)?.name ?? "가구"
      }
      detail={
        withRoom
          ? `${rooms[roomOf(issue)]?.name ?? "방 밖"} · ${issue.reason}`
          : issue.reason
      }
      highlighted={selectedId === issue.furnitureId}
      aria-pressed={selectedId === issue.furnitureId}
      onClick={() => onSelect(issue.furnitureId)}
    />
  )
  return (
    <section className="placement-issues" aria-label="배치 확인이 필요한 가구">
      {here.length > 0 && (
        <>
          <Callout
            tone="critical"
            title={`${roomIndex === null ? "" : "이 방 "}배치 확인 필요 ${here.length}개`}
            description="가구를 골라 위치를 바꾸거나 빼 주세요. 고치는 동안에도 저장돼요."
          />
          <List>{here.map((issue) => row(issue, false))}</List>
        </>
      )}
      {others.length > 0 && (
        <>
          <ActionButton
            variant="ghost"
            size="small"
            className="placement-issues-others"
            aria-expanded={othersOpen}
            aria-controls={othersOpen ? othersId : undefined}
            onClick={() => setOthersOpen((open) => !open)}
          >
            다른 방 배치 확인 필요 {others.length}개
            <SuffixIcon
              svg={othersOpen ? <IconChevronUpLine /> : <IconChevronDownLine />}
            />
          </ActionButton>
          {othersOpen && (
            <List id={othersId}>{others.map((issue) => row(issue, true))}</List>
          )}
        </>
      )}
    </section>
  )
}
