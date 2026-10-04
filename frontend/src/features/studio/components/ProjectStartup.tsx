import { IconExclamationmarkCircleLine } from "@karrotmarket/react-monochrome-icon"
import { Icon } from "@seed-design/react"
import { ProgressCircle } from "seed-design/ui/progress-circle"
import { ResultSection } from "seed-design/ui/result-section"

import type { ProjectLoadState } from "@/features/studio/types"

export function ProjectStartup({
  state,
  onRetry,
  onCreate,
}: {
  state: ProjectLoadState
  onRetry: () => void
  onCreate: () => void
}) {
  if (state.status === "loading") {
    return (
      <div className="view-empty" aria-live="polite" aria-busy="true">
        <ResultSection
          asset={
            <span className="result-asset">
              <ProgressCircle size="40" />
            </span>
          }
          title="프로젝트를 불러오고 있어요"
          description="마지막으로 작업한 집 구조와 가구를 가져오는 중이에요."
        />
      </div>
    )
  }

  return (
    <div className="view-empty" role="alert">
      <ResultSection
        asset={
          <span className="result-asset is-critical">
            <Icon svg={<IconExclamationmarkCircleLine />} size="x8" />
          </span>
        }
        title="프로젝트를 불러오지 못했어요"
        description={state.message}
        primaryActionProps={{ children: "다시 시도", onClick: onRetry }}
        secondaryActionProps={{
          children: "새 프로젝트 만들기",
          onClick: onCreate,
        }}
      />
    </div>
  )
}
