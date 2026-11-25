import {
  IconExclamationmarkCircleLine,
  IconHouseLine,
} from "@karrotmarket/react-monochrome-icon"
import { Icon } from "@seed-design/react"
import { ProgressCircle } from "seed-design/ui/progress-circle"
import { ResultSection } from "seed-design/ui/result-section"

import type { ProjectLoadState } from "@/features/studio/types"

export function ProjectStartup({
  state,
  onRetry,
  onCreate,
  onLogout,
}: {
  state: ProjectLoadState
  onRetry: () => void
  onCreate: () => void
  /** Only passed when the studio sits behind a login. */
  onLogout?: () => void
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

  if (state.status === "empty") {
    return (
      <div className="view-empty">
        <ResultSection
          asset={
            <span className="result-asset">
              <Icon svg={<IconHouseLine />} size="x8" />
            </span>
          }
          title="첫 프로젝트를 만들어 주세요"
          description="이 계정에는 아직 저장된 프로젝트가 없어요. 새 프로젝트를 만들면 집 구조부터 그릴 수 있어요."
          primaryActionProps={{
            children: "새 프로젝트 만들기",
            onClick: onCreate,
          }}
          {...(onLogout
            ? {
                secondaryActionProps: {
                  children: "로그아웃",
                  onClick: onLogout,
                },
              }
            : {})}
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
