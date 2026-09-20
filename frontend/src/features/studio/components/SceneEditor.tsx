import { lazy, Suspense } from "react"
import {
  Box,
  Grid2X2,
  Layers3,
  LayoutDashboard,
  LoaderCircle,
  Maximize2,
  Move,
  PanelLeftClose,
  Redo2,
  Undo2,
  View,
} from "lucide-react"

import { catalog } from "@/features/studio/data"
import type { Project, ViewMode } from "@/features/studio/types"

const RoomScene = lazy(async () => {
  const module = await import("@/features/studio/RoomScene")
  return { default: module.RoomScene }
})

const money = new Intl.NumberFormat("ko-KR")

export function SceneEditor({
  project,
  selectedId,
  mode,
  showLibrary,
  canUndo,
  canRedo,
  onToggleLibrary,
  onModeChange,
  onUndo,
  onRedo,
  onFullscreenError,
  onSelect,
  onMove,
  onMoveEnd,
}: {
  project: Project
  selectedId: string | null
  mode: ViewMode
  showLibrary: boolean
  canUndo: boolean
  canRedo: boolean
  onToggleLibrary: () => void
  onModeChange: (mode: ViewMode) => void
  onUndo: () => void
  onRedo: () => void
  onFullscreenError: () => void
  onSelect: (id: string | null) => void
  onMove: (id: string, x: number, z: number) => void
  onMoveEnd: () => void
}) {
  const budget = project.furniture.reduce(
    (total, item) =>
      total +
      (catalog.find((entry) => entry.id === item.catalogId)?.price ?? 0),
    0
  )

  return (
    <section className="scene-panel" aria-label="공간 편집">
      <div className="scene-toolbar">
        <div className="toolbar-left">
          <button
            className="icon-button"
            aria-label={showLibrary ? "라이브러리 접기" : "라이브러리 열기"}
            onClick={onToggleLibrary}
          >
            <PanelLeftClose size={17} />
          </button>
          <span className="toolbar-divider" />
          <div className="view-switch" aria-label="웹 보기 방식">
            {(
              [
                { id: "2d", label: "2D", icon: Grid2X2 },
                { id: "3d", label: "3D", icon: Box },
                { id: "vr", label: "웹 VR", icon: View },
              ] as const
            ).map((view) => (
              <button
                key={view.id}
                aria-pressed={mode === view.id}
                className={mode === view.id ? "active" : ""}
                onClick={() => onModeChange(view.id)}
              >
                <view.icon size={15} />
                {view.label}
              </button>
            ))}
          </div>
        </div>
        <div className="toolbar-right">
          <button
            className="icon-button"
            aria-label="실행 취소"
            disabled={!canUndo}
            onClick={onUndo}
          >
            <Undo2 size={17} />
          </button>
          <button
            className="icon-button"
            aria-label="다시 실행"
            disabled={!canRedo}
            onClick={onRedo}
          >
            <Redo2 size={17} />
          </button>
          <span className="toolbar-divider" />
          <button
            className="icon-button"
            aria-label="편집 영역 전체 화면"
            onClick={() =>
              document
                .querySelector(".scene-panel")
                ?.requestFullscreen()
                .catch(onFullscreenError)
            }
          >
            <Maximize2 size={16} />
          </button>
        </div>
      </div>
      <div className="scene-area">
        <div className="scene-caption">
          <span className="scene-dot" />
          <span>
            {mode === "vr"
              ? "같은 웹에서 VR로 확인하는 중"
              : mode === "2d"
                ? "위에서 보는 2D 배치"
                : "브라우저 3D로 꾸미는 중"}
          </span>
        </div>
        <Suspense
          fallback={
            <div className="scene-loading">
              <LoaderCircle className="spin" size={20} />
              3D 공간을 준비하고 있어요
            </div>
          }
        >
          <RoomScene
            furniture={project.furniture}
            selectedId={selectedId}
            mode={mode}
            room={project.room}
            onSelect={onSelect}
            onMove={onMove}
            onMoveEnd={onMoveEnd}
          />
        </Suspense>
        <div className="scene-scale">
          <span />1 m
        </div>
        <div className="scene-hint">
          <Move size={14} />
          <span>
            {mode === "vr"
              ? "헤드셋에서 가구를 집고 바닥을 가리켜 놓으세요"
              : "가구를 드래그하면 이동합니다. 빈 공간을 드래그하면 회전하고 스크롤하면 확대합니다."}
          </span>
        </div>
        {mode === "vr" && (
          <div className="vr-information">
            <View size={20} />
            <strong>앱 설치 없이 웹에서 들어가세요</strong>
            <p>
              WebXR 지원 헤드셋과 HTTPS 연결이 필요합니다. 아래 웹 VR 버튼에서
              이 기기의 지원 여부를 확인할 수 있습니다.
            </p>
          </div>
        )}
      </div>
      <div className="scene-bottom">
        <div>
          <Layers3 size={16} />
          <strong>{project.furniture.length}개의 가구</strong>
          <span className="bottom-divider" />
          <span>
            {(project.dimensions.width * project.dimensions.depth).toFixed(1)}{" "}
            m²
          </span>
        </div>
        <span className="scene-note">배치 기준 모델</span>
      </div>
      <div className="layout-summary">
        <div className="summary-icon">
          <LayoutDashboard size={21} />
        </div>
        <div>
          <strong>지금의 공간 계획</strong>
          <p>가구를 바꾸고 위치를 조절하며 가장 편한 배치를 찾아보세요.</p>
        </div>
        <div className="budget">
          <span>가구 예상 금액</span>
          <strong>₩{money.format(budget)}</strong>
        </div>
      </div>
    </section>
  )
}
