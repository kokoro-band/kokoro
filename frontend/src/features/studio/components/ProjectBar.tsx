import { ArrowDownToLine, ArrowLeft, LoaderCircle, Save } from "lucide-react"

import type { Project } from "@/features/studio/types"
import { ActionButton } from "@seed-design/react"

export function ProjectBar({
  project,
  saving,
  dirty,
  saveBusy,
  onOpenSample,
  onExport,
  onSave,
}: {
  project: Project
  saving: boolean
  dirty: boolean
  saveBusy: boolean
  onOpenSample: () => void
  onExport: () => void
  onSave: () => void
}) {
  return (
    <div className="project-bar">
      <div className="project-heading">
        <button
          className="icon-button back-button"
          aria-label="예제 프로젝트 열기"
          onClick={onOpenSample}
        >
          <ArrowLeft size={18} />
        </button>
        <h1>{project.name}</h1>
      </div>
      <div className="project-actions">
        <span className="save-status" aria-live="polite">
          {saving
            ? "변경 사항 저장 중"
            : dirty
              ? "저장하지 않은 변경"
              : "모든 변경 저장됨"}
        </span>
        <ActionButton
          variant="neutralOutline"
          size="small"
          className="export-button"
          onClick={onExport}
        >
          <ArrowDownToLine size={16} />
          내보내기
        </ActionButton>
        <ActionButton
          variant="brandSolid"
          size="small"
          className="save-button"
          onClick={onSave}
          disabled={saveBusy || saving}
        >
          {saveBusy || saving ? (
            <LoaderCircle className="spin" size={16} />
          ) : (
            <Save size={16} />
          )}
          저장
        </ActionButton>
      </div>
    </div>
  )
}
