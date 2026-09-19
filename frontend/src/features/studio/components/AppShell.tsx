import type { FormEvent, RefObject } from "react"
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Box,
  Check,
  ChevronDown,
  ChevronRight,
  LoaderCircle,
  RefreshCw,
  Save,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { isServerMode } from "@/features/studio/project-api"
import type { Project } from "@/features/studio/types"

export type ProjectLoadState =
  | { status: "loading"; message: "" }
  | { status: "ready"; message: "" }
  | { status: "error"; message: string }

export function AppHeader({ onCreate }: { onCreate: () => void }) {
  return (
    <header className="app-header">
      <a className="brand" href="#workspace" aria-label="코코로 스튜디오">
        <span className="brand-mark">
          <Box size={20} />
        </span>
        kokoro<span className="brand-word">studio</span>
      </a>
      <nav className="header-nav" aria-label="주 메뉴">
        <a className="active" href="#workspace">
          내 공간
        </a>
        <button onClick={onCreate}>새 프로젝트</button>
      </nav>
      <div className="header-right">
        <span className="mode-label">
          <span />
          {isServerMode ? "서버 연결 모드" : "로컬 데모"}
        </span>
        <button className="avatar" title="현재는 로그인 없는 데모입니다">
          K
        </button>
      </div>
    </header>
  )
}

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
          <LoaderCircle className="spin" size={22} />
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
        <Button onClick={onRetry}>
          <RefreshCw size={16} />
          다시 시도
        </Button>
        <Button variant="outline" onClick={onCreate}>
          새 프로젝트 시작
        </Button>
      </div>
    </section>
  )
}

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
        <div>
          <div className="breadcrumb">
            내 공간 <ChevronRight size={12} /> 리모델링 프로젝트
          </div>
          <h1>
            {project.name}
            <ChevronDown size={16} />
          </h1>
        </div>
        <Badge className="project-badge" variant="outline">
          {project.roomType}
        </Badge>
      </div>
      <div className="project-actions">
        <span className="save-status" aria-live="polite">
          {saving
            ? "변경 사항 저장 중"
            : dirty
              ? "저장하지 않은 변경"
              : "모든 변경 저장됨"}
        </span>
        <Button variant="outline" className="export-button" onClick={onExport}>
          <ArrowDownToLine size={16} />
          내보내기
        </Button>
        <Button
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
        </Button>
      </div>
    </div>
  )
}

export function StudioFooter() {
  return (
    <footer className="app-footer">
      <span>
        <Check size={13} />
        도면과 배치 데이터를 하나의 프로젝트로
      </span>
      <span>코코로 리모델링 스튜디오</span>
    </footer>
  )
}

export function NewProjectDialog({
  dialogRef,
  nameRef,
  busy,
  onSubmit,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>
  nameRef: RefObject<HTMLInputElement | null>
  busy: boolean
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  return (
    <dialog ref={dialogRef} className="new-project-dialog">
      <form onSubmit={onSubmit}>
        <span className="dialog-icon">
          <Box size={26} />
        </span>
        <h2>새로운 공간을 시작해요</h2>
        <p>프로젝트 이름을 정한 뒤 도면을 업로드하세요.</p>
        <label htmlFor="project-name">프로젝트 이름</label>
        <input
          ref={nameRef}
          id="project-name"
          placeholder="예: 우리 집 거실"
          required
          maxLength={60}
        />
        <div>
          <Button
            type="button"
            variant="outline"
            onClick={() => dialogRef.current?.close()}
          >
            취소
          </Button>
          <Button type="submit" disabled={busy}>
            프로젝트 만들기 <ArrowRight size={16} />
          </Button>
        </div>
      </form>
    </dialog>
  )
}
