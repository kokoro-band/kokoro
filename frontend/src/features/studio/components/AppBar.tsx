import {
  IconArrowClockwiseCircularLine,
  IconArrowCounterclockwiseCircularLine,
  IconArrowDownHorizlineLine,
  IconChevronDownLine,
  IconDocumentLine,
  IconHouseLine,
  IconPlusLine,
  IconQuestionmarkCircleLine,
} from "@karrotmarket/react-monochrome-icon"
import {
  ActionButton,
  Icon,
  NotificationBadge,
  PrefixIcon,
} from "@seed-design/react"
import {
  MenuContent,
  MenuGroup,
  MenuItem,
  MenuRoot,
  MenuTrigger,
} from "seed-design/ui/menu"

import { Type } from "@/components/kokoro/Type"
import { shortcutText } from "@/features/studio/shortcuts"

export type StudioView = "structure" | "arrange" | "summary"

const studioViews: { id: StudioView; label: string }[] = [
  { id: "structure", label: "구조" },
  { id: "arrange", label: "배치" },
  { id: "summary", label: "내역" },
]

export function AppBar({
  projectName,
  view,
  structureDirty,
  showViews,
  dirty,
  saving,
  saveFailed,
  saveRejected,
  saveBusy,
  onViewChange,
  onSave,
  onRestoreSaved,
  onCreateProject,
  onOpenSample,
  onOpenFloorPlan,
  onExport,
  onOpenShortcuts,
}: {
  projectName: string
  view: StudioView
  structureDirty: boolean
  /** Show the project menu and view navigation after a project loads. */
  showViews: boolean
  /** Whether the furniture layout has unsaved changes. */
  dirty: boolean
  saving: boolean
  saveFailed: boolean
  saveRejected: boolean
  saveBusy: boolean
  onViewChange: (view: StudioView) => void
  onSave: () => void
  onRestoreSaved: () => void
  onCreateProject: () => void
  onOpenSample: () => void
  onOpenFloorPlan: () => void
  onExport: () => void
  onOpenShortcuts: () => void
}) {
  return (
    <header className="app-bar">
      <div className="app-bar-start">
        <a className="app-bar-brand" href="#workspace" aria-label="코코로">
          <img
            src={`${import.meta.env.BASE_URL}assets/pixel/kokoro-mark.svg`}
            alt=""
          />
          <Type variant="title" className="app-bar-wordmark">
            kokoro
          </Type>
        </a>
        {showViews && (
          <>
            <span className="app-bar-divider" aria-hidden="true" />
            <MenuRoot size="small" placement="bottom-start">
              <MenuTrigger asChild>
                <ActionButton
                  variant="ghost"
                  size="small"
                  className="project-switcher"
                  aria-label={`${projectName} 프로젝트 메뉴`}
                >
                  <span className="project-switcher-name" title={projectName}>
                    {projectName}
                  </span>
                  <Icon svg={<IconChevronDownLine />} size="x4" />
                </ActionButton>
              </MenuTrigger>
              <MenuContent className="project-menu">
                <MenuGroup>
                  <MenuItem
                    label="새 프로젝트"
                    prefixIcon={<IconPlusLine />}
                    onClick={onCreateProject}
                  />
                  <MenuItem
                    label="예제 집 열기"
                    prefixIcon={<IconHouseLine />}
                    onClick={onOpenSample}
                  />
                </MenuGroup>
                <MenuGroup>
                  <MenuItem
                    label="도면 파일"
                    prefixIcon={<IconDocumentLine />}
                    onClick={onOpenFloorPlan}
                  />
                  <MenuItem
                    label="JSON으로 내보내기"
                    prefixIcon={<IconArrowDownHorizlineLine />}
                    onClick={onExport}
                  />
                </MenuGroup>
              </MenuContent>
            </MenuRoot>
          </>
        )}
      </div>

      {showViews && (
        <nav className="app-nav" aria-label="작업 화면">
          {studioViews.map((item) => {
            const current = item.id === view
            const flagged = item.id === "structure" && structureDirty
            return (
              <ActionButton
                key={item.id}
                variant="ghost"
                size="medium"
                color={current ? "fg.neutral" : "fg.neutralMuted"}
                className="choice-button app-nav-item"
                aria-current={current ? "page" : undefined}
                aria-label={
                  flagged ? `${item.label}, 저장하지 않은 변경 있음` : undefined
                }
                onClick={() => onViewChange(item.id)}
              >
                {item.label}
                {flagged && (
                  <NotificationBadge size="small" className="app-nav-badge" />
                )}
              </ActionButton>
            )
          })}
        </nav>
      )}

      <div className="app-bar-end">
        {showViews && !saveFailed && (
          <Type
            variant="caption"
            className="save-status"
            data-state={
              saving || saveBusy ? "saving" : dirty ? "dirty" : "saved"
            }
          >
            {saving || saveBusy ? "저장 중" : dirty ? "저장 안 됨" : "저장됨"}
          </Type>
        )}
        {saveRejected && (
          <ActionButton
            variant="neutralWeak"
            size="small"
            onClick={onRestoreSaved}
            disabled={saving}
            title="마지막으로 저장한 배치로 돌아가요"
          >
            <PrefixIcon svg={<IconArrowCounterclockwiseCircularLine />} />
            저장된 배치로 되돌리기
          </ActionButton>
        )}
        {saveFailed && !saveRejected && (
          <ActionButton
            variant="neutralWeak"
            size="small"
            onClick={onSave}
            disabled={saveBusy || saving}
            loading={saveBusy}
          >
            <PrefixIcon svg={<IconArrowClockwiseCircularLine />} />
            다시 저장
          </ActionButton>
        )}
        <ActionButton
          variant="ghost"
          size="small"
          layout="iconOnly"
          className="shortcut-guide-button"
          aria-label="단축키"
          title={`단축키 (${shortcutText("guide")})`}
          onClick={onOpenShortcuts}
        >
          <Icon svg={<IconQuestionmarkCircleLine />} size="x5" />
        </ActionButton>
      </div>
    </header>
  )
}
