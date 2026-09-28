import { Callout } from "seed-design/ui/callout"
import { List, ListButtonItem } from "seed-design/ui/list"

import type { PlacementIssue } from "../placement-issues"
import type { Furniture } from "../types"

export function PlacementIssueList({
  furniture,
  issues,
  selectedId,
  onSelect,
}: {
  furniture: Furniture[]
  issues: PlacementIssue[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  if (!issues.length) return null
  return (
    <section className="placement-issues" aria-label="배치 확인이 필요한 가구">
      <Callout
        tone="critical"
        title={`배치 확인 필요 ${issues.length}개`}
        description="구조 작업은 계속할 수 있어요. 기존 가구를 남겨 두었으니 하나씩 골라 위치를 바꾸거나 빼 주세요."
      />
      <List>
        {issues.map((issue) => (
          <ListButtonItem
            key={issue.furnitureId}
            data-furniture-id={issue.furnitureId}
            title={
              furniture.find((item) => item.id === issue.furnitureId)?.name ??
              "가구"
            }
            detail={issue.reason}
            highlighted={selectedId === issue.furnitureId}
            aria-pressed={selectedId === issue.furnitureId}
            onClick={() => onSelect(issue.furnitureId)}
          />
        ))}
      </List>
    </section>
  )
}
