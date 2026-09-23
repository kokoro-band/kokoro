import { AlertCircle, RefreshCw } from "lucide-react"
import { ActionButton, ProgressCircle } from "@seed-design/react"

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
      <section className="project-startup" aria-live="polite" aria-busy="true">
        <div className="startup-loading-icon">
          <ProgressCircle.Root>
            <ProgressCircle.Track />
            <ProgressCircle.Range />
          </ProgressCircle.Root>
        </div>
        <h1>마지막 프로젝트를 불러오고 있어요</h1>
        <p>서버에 저장된 도면과 가구 배치를 확인하고 있습니다.</p>
        <div className="startup-skeleton" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </section>
    )
  }

  return (
    <section className="project-startup error" role="alert">
      <div className="startup-error-icon">
        <AlertCircle size={23} />
      </div>
      <h1>프로젝트를 불러오지 못했어요</h1>
      <p>{state.message}</p>
      <div className="startup-actions">
        <ActionButton onClick={onRetry} variant="brandSolid" size="medium">
          <RefreshCw size={16} />
          다시 시도
        </ActionButton>
        <ActionButton variant="neutralOutline" size="medium" onClick={onCreate}>
          새 프로젝트 시작
        </ActionButton>
      </div>
    </section>
  )
}
