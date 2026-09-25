import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import {
  IconArrowUturnLeftLine,
  IconArrowUturnRightLine,
  IconCorner4InwardLine,
  IconCorner4OutwardLine,
} from "@karrotmarket/react-monochrome-icon"
import { ActionButton, Icon } from "@seed-design/react"
import { ProgressCircle } from "seed-design/ui/progress-circle"

import { SnackbarAvoidOverlap } from "seed-design/ui/snackbar"
import { ToolbarChoice } from "@/components/kokoro/ToolbarChoice"
import { Type } from "@/components/kokoro/Type"
import { roomForFurniture } from "@/features/studio/house-navigation"
import type { Project, RoomLabel, ViewMode } from "@/features/studio/types"

const RoomScene = lazy(async () => {
  const module = await import("@/features/studio/RoomScene")
  return { default: module.RoomScene }
})

const viewModes: { value: ViewMode; label: string }[] = [
  { value: "2d", label: "2D" },
  { value: "3d", label: "3D" },
  { value: "vr", label: "VR" },
]

const hints: Record<Exclude<ViewMode, "vr">, string> = {
  "2d": "가구를 끌어서 옮겨요. 휠로 확대해요.",
  "3d": "가구를 끌어서 옮기고, 빈 곳을 끌어서 둘러봐요.",
}

export function SceneEditor({
  project,
  focusRoom,
  minimap,
  selectedId,
  mode,
  canUndo,
  canRedo,
  onModeChange,
  onUndo,
  onRedo,
  onFullscreenError,
  onSelect,
  onMove,
  onMoveEnd,
}: {
  project: Project
  focusRoom: RoomLabel | null
  minimap?: ReactNode
  selectedId: string | null
  mode: ViewMode
  canUndo: boolean
  canRedo: boolean
  onModeChange: (mode: ViewMode) => void
  onUndo: () => void
  onRedo: () => void
  onFullscreenError: () => void
  onSelect: (id: string | null) => void
  onMove: (id: string, x: number, z: number) => void
  onMoveEnd: () => void
}) {
  const panelRef = useRef<HTMLElement>(null)
  const xrEntryRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const rooms = project.room?.rooms
  const focusIndex = focusRoom && rooms ? rooms.indexOf(focusRoom) : -1
  const visibleFurniture =
    focusIndex >= 0 && rooms
      ? project.furniture.filter(
          (item) => roomForFurniture(rooms, item) === focusIndex
        )
      : project.furniture

  useEffect(() => {
    const syncFullscreen = () => {
      setIsFullscreen(document.fullscreenElement === panelRef.current)
    }
    document.addEventListener("fullscreenchange", syncFullscreen)
    return () =>
      document.removeEventListener("fullscreenchange", syncFullscreen)
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!event.ctrlKey && !event.metaKey) return
      const target = event.target as HTMLElement | null
      if (target?.closest("input, textarea, [contenteditable='true']")) return
      const key = event.key.toLowerCase()
      if (key !== "z" && key !== "y") return
      event.preventDefault()
      if (key === "y" || event.shiftKey) onRedo()
      else onUndo()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onUndo, onRedo])

  const toggleFullscreen = () => {
    const panel = panelRef.current
    if (!panel) return
    const action = isFullscreen
      ? document.exitFullscreen()
      : panel.requestFullscreen()
    action.catch(onFullscreenError)
  }

  return (
    <section ref={panelRef} className="viewport" aria-label="배치 화면">
      <div className="viewport-toolbar">
        <ToolbarChoice
          items={viewModes}
          value={mode}
          onValueChange={onModeChange}
          aria-label="보기 방식"
        />
        <div className="viewport-toolbar-actions">
          <ActionButton
            variant="ghost"
            size="small"
            layout="iconOnly"
            aria-label="실행 취소"
            title="실행 취소 (Ctrl+Z)"
            disabled={!canUndo}
            onClick={onUndo}
          >
            <Icon svg={<IconArrowUturnLeftLine />} size="x5" />
          </ActionButton>
          <ActionButton
            variant="ghost"
            size="small"
            layout="iconOnly"
            aria-label="다시 실행"
            title="다시 실행 (Ctrl+Shift+Z)"
            disabled={!canRedo}
            onClick={onRedo}
          >
            <Icon svg={<IconArrowUturnRightLine />} size="x5" />
          </ActionButton>
          <span
            className="toolbar-divider fullscreen-control"
            aria-hidden="true"
          />
          <ActionButton
            className="fullscreen-control"
            variant="ghost"
            size="small"
            layout="iconOnly"
            aria-label={
              isFullscreen ? "전체 화면 끝내기" : "전체 화면으로 보기"
            }
            aria-pressed={isFullscreen}
            onClick={toggleFullscreen}
          >
            <Icon
              svg={
                isFullscreen ? (
                  <IconCorner4InwardLine />
                ) : (
                  <IconCorner4OutwardLine />
                )
              }
              size="x5"
            />
          </ActionButton>
        </div>
      </div>
      <div className="viewport-canvas">
        <Suspense
          fallback={
            <div className="viewport-loading" aria-live="polite">
              <div className="loading-row">
                <ProgressCircle size="24" />
                <Type variant="description">3D 공간을 준비하고 있어요</Type>
              </div>
            </div>
          }
        >
          <RoomScene
            furniture={visibleFurniture}
            selectedId={selectedId}
            mode={mode}
            room={project.room}
            focusRoom={focusRoom}
            onSelect={onSelect}
            onMove={onMove}
            onMoveEnd={onMoveEnd}
            xrEntryContainer={xrEntryRef}
          />
        </Suspense>
        {mode === "vr" && (
          <div className="viewport-overlay overlay-center">
            <section className="vr-entry-card" aria-labelledby="vr-entry-title">
              <Type variant="heading" as="h2" id="vr-entry-title">
                VR로 들어가기
              </Type>
              <Type variant="description" as="p">
                WebXR을 지원하는 헤드셋이 연결되었는지 확인해주세요.
              </Type>
              <div ref={xrEntryRef} className="vr-entry-slot" />
            </section>
          </div>
        )}
        {minimap && (
          <div className="viewport-overlay overlay-top-end viewport-minimap">
            {minimap}
          </div>
        )}
        {mode !== "vr" && (
          <SnackbarAvoidOverlap>
            <div className="viewport-overlay overlay-bottom-start viewport-hint">
              <Type variant="caption">{hints[mode]}</Type>
            </div>
          </SnackbarAvoidOverlap>
        )}
      </div>
    </section>
  )
}
