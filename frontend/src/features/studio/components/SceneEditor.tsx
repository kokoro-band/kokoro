import { lazy, Suspense } from "react"
import {
  Box,
  Grid2X2,
  LoaderCircle,
  Maximize2,
  Move,
  PanelLeftClose,
  Redo2,
  Undo2,
  View,
} from "lucide-react"
import { ActionButton, Icon, SegmentedControl } from "@seed-design/react"

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
          <ActionButton
            className="icon-button"
            variant="ghost"
            size="small"
            layout="iconOnly"
            aria-label={showLibrary ? "라이브러리 접기" : "라이브러리 열기"}
            onClick={onToggleLibrary}
          >
            <Icon svg={<PanelLeftClose />} size="x4" />
          </ActionButton>
          <span className="toolbar-divider" />
          <SegmentedControl.Root
            className="view-switch"
            value={mode}
            onValueChange={(value) => onModeChange(value as ViewMode)}
            aria-label="웹 보기 방식"
          >
            {(
              [
                { id: "2d", label: "2D", icon: Grid2X2 },
                { id: "3d", label: "3D", icon: Box },
                { id: "vr", label: "VR", icon: View },
              ] as const
            ).map((view) => (
              <SegmentedControl.Item key={view.id} value={view.id}>
                <SegmentedControl.ItemHiddenInput />
                <view.icon size={15} />
                {view.label}
              </SegmentedControl.Item>
            ))}
            <SegmentedControl.Indicator />
          </SegmentedControl.Root>
        </div>
        <div className="toolbar-right">
          <ActionButton
            className="icon-button"
            variant="ghost"
            size="small"
            layout="iconOnly"
            aria-label="실행 취소"
            disabled={!canUndo}
            onClick={onUndo}
          >
            <Icon svg={<Undo2 />} size="x4" />
          </ActionButton>
          <ActionButton
            className="icon-button"
            variant="ghost"
            size="small"
            layout="iconOnly"
            aria-label="다시 실행"
            disabled={!canRedo}
            onClick={onRedo}
          >
            <Icon svg={<Redo2 />} size="x4" />
          </ActionButton>
          <span className="toolbar-divider" />
          <ActionButton
            className="icon-button"
            variant="ghost"
            size="small"
            layout="iconOnly"
            aria-label="편집 영역 전체 화면"
            onClick={() =>
              document
                .querySelector(".scene-panel")
                ?.requestFullscreen()
                .catch(onFullscreenError)
            }
          >
            <Icon svg={<Maximize2 />} size="x4" />
          </ActionButton>
        </div>
      </div>
      <div className="scene-area">
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
              : "가구는 끌어서 옮기고 빈 공간은 끌어서 회전하세요."}
          </span>
        </div>
        {mode === "vr" && (
          <div className="vr-information">
            <strong>WebXR 지원 헤드셋과 HTTPS 연결이 필요합니다.</strong>
          </div>
        )}
      </div>
      <div className="scene-bottom">
        <span>{project.furniture.length}개 가구</span>
        <span className="bottom-divider" />
        <span>
          {(project.dimensions.width * project.dimensions.depth).toFixed(1)} m²
        </span>
        <span className="bottom-divider" />
        <strong>₩{money.format(budget)}</strong>
      </div>
    </section>
  )
}
