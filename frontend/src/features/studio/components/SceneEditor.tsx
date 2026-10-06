import {
  lazy,
  useCallback,
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
  IconHandPointUpLine,
  IconHandWaveLine,
  IconMapLine,
  IconSofaLine,
} from "@karrotmarket/react-monochrome-icon"
import { ActionButton, Icon } from "@seed-design/react"
import { DoorClosed, DoorOpen } from "lucide-react"
import { HelpBubbleAnchor } from "seed-design/ui/help-bubble"
import { ProgressCircle } from "seed-design/ui/progress-circle"
import {
  MenuRoot,
  MenuTrigger,
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
} from "seed-design/ui/menu"

import { SnackbarAvoidOverlap } from "seed-design/ui/snackbar"
import { ToolbarChoice } from "@/components/kokoro/ToolbarChoice"
import { Type } from "@/components/kokoro/Type"
import { roomForFurniture } from "@/features/studio/house-navigation"
import { doorMenuLabels } from "@/features/studio/room-door-labels"
import { useShortcut } from "@/features/studio/hooks/useShortcut"
import { shortcutText, type ShortcutId } from "@/features/studio/shortcuts"
import type {
  Furniture,
  Project,
  RoomLabel,
  ViewMode,
} from "@/features/studio/types"
import type { CursorTool } from "@/features/studio/scene-interaction"

const RoomScene = lazy(async () => {
  const module = await import("@/features/studio/RoomScene")
  return { default: module.RoomScene }
})

const viewModes: { value: ViewMode; label: string }[] = [
  { value: "2d", label: "2D" },
  { value: "3d", label: "3D" },
  { value: "vr", label: "VR" },
]

const cursorTools: { value: CursorTool; label: string; icon: ReactNode }[] = [
  { value: "select", label: "선택", icon: <IconHandPointUpLine /> },
  { value: "move", label: "가구 이동", icon: <IconSofaLine /> },
  { value: "pan", label: "화면 이동", icon: <IconHandWaveLine /> },
]

const cursorShortcuts: Record<CursorTool, ShortcutId> = {
  select: "cursorSelect",
  move: "cursorMove",
  pan: "cursorPan",
}

const hints: Record<CursorTool, string> = {
  select: "가구를 눌러 선택해요. 문을 누르면 열고 닫을 수 있어요.",
  move: "가구는 벽에 맞춰 멈춰요. 문을 누르면 열고 닫을 수 있어요.",
  pan: "화면을 끌어서 옮겨요. 휠로 확대해요.",
}

export function SceneEditor({
  project,
  focusRoom,
  minimap,
  isMobile,
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
  onConstrainPose,
  onPlace,
}: {
  project: Project
  focusRoom: RoomLabel | null
  minimap?: ReactNode
  isMobile?: boolean
  selectedId: string | null
  mode: ViewMode
  canUndo: boolean
  canRedo: boolean
  onModeChange: (mode: ViewMode) => void
  onUndo: () => void
  onRedo: () => void
  onFullscreenError: () => void
  onSelect: (id: string | null) => void
  onMove: (
    id: string,
    x: number,
    z: number,
    focus?: RoomLabel | null
  ) => boolean
  onMoveEnd: () => void
  onConstrainPose: (
    item: Furniture,
    update: Partial<Pick<Furniture, "x" | "z" | "rotation">>,
    focus?: RoomLabel | null
  ) => Furniture
  onPlace: (
    id: string,
    pose: Pick<Furniture, "x" | "z" | "rotation">,
    focus?: RoomLabel | null
  ) => boolean
}) {
  const panelRef = useRef<HTMLElement>(null)
  const xrEntryRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isMinimapOpen, setIsMinimapOpen] = useState(false)
  const [tool, setTool] = useState<CursorTool>("move")
  const [hintTool, setHintTool] = useState<CursorTool | null>(null)
  const hintTimerRef = useRef<number | undefined>(undefined)
  const hintClosedAtRef = useRef(0)
  const [doorStates, setDoorStates] = useState<Record<string, boolean>>({})
  const [doorMenuOpen, setDoorMenuOpen] = useState(false)
  const [highlightedDoorId, setHighlightedDoorId] = useState<string | null>(
    null
  )
  const onDoorChange = useCallback(function changeDoorState(
    id: string,
    open: boolean
  ) {
    setDoorStates((states) => ({ ...states, [id]: open }))
  }, [])
  const roomModel = project.room
  const doors =
    roomModel?.openings.filter((opening) => opening.type === "door") ?? []
  const doorLabels = roomModel ? doorMenuLabels(roomModel) : null
  const allDoorsOpen = doors.every((door) => doorStates[door.id] === true)
  const allDoorsClosed = doors.every((door) => !doorStates[door.id])
  const changeAllDoors = (open: boolean) => {
    setDoorStates((states) => {
      const next = { ...states }
      for (const door of doors) next[door.id] = open
      return next
    })
  }
  const minimapButtonRef = useRef<HTMLButtonElement>(null)
  const rooms = project.room?.rooms
  const focusIndex = focusRoom && rooms ? rooms.indexOf(focusRoom) : -1
  const visibleFurniture =
    focusIndex >= 0 && rooms
      ? project.furniture.filter(
          (item) => roomForFurniture(rooms, item) === focusIndex
        )
      : project.furniture

  useEffect(function synchronizeFullscreen() {
    const syncFullscreen = () => {
      setIsFullscreen(document.fullscreenElement === panelRef.current)
    }
    document.addEventListener("fullscreenchange", syncFullscreen)
    return () =>
      document.removeEventListener("fullscreenchange", syncFullscreen)
  }, [])

  useEffect(
    function closeMinimapOnEscape() {
      if (!isMobile || !isMinimapOpen) return
      const closeOnEscape = (event: KeyboardEvent) => {
        if (event.key !== "Escape") return
        setIsMinimapOpen(false)
        minimapButtonRef.current?.focus()
      }
      document.addEventListener("keydown", closeOnEscape)
      return () => document.removeEventListener("keydown", closeOnEscape)
    },
    [isMobile, isMinimapOpen]
  )

  const showToolHintSoon = (value: CursorTool, at: number) => {
    window.clearTimeout(hintTimerRef.current)
    const delay = at - hintClosedAtRef.current < 300 ? 0 : 600
    hintTimerRef.current = window.setTimeout(() => setHintTool(value), delay)
  }

  const hideToolHint = (at = 0) => {
    window.clearTimeout(hintTimerRef.current)
    setHintTool((current) => {
      if (current) hintClosedAtRef.current = at
      return null
    })
  }

  useEffect(function clearToolHintTimer() {
    return () => window.clearTimeout(hintTimerRef.current)
  }, [])

  const toggleFullscreen = () => {
    const panel = panelRef.current
    if (!panel) return
    const action = isFullscreen
      ? document.exitFullscreen()
      : panel.requestFullscreen()
    action.catch(onFullscreenError)
  }

  useShortcut("undo", onUndo)
  useShortcut("redo", onRedo)
  useShortcut("toggleDimension", () =>
    onModeChange(mode === "2d" ? "3d" : "2d")
  )
  useShortcut("fullscreen", toggleFullscreen)
  useShortcut("cursorSelect", () => setTool("select"), {
    enabled: mode !== "vr",
  })
  useShortcut("cursorMove", () => setTool("move"), { enabled: mode !== "vr" })
  useShortcut("cursorPan", () => setTool("pan"), { enabled: mode !== "vr" })

  return (
    <section ref={panelRef} className="viewport" aria-label="배치 화면">
      <div className="viewport-toolbar">
        <ToolbarChoice
          items={viewModes.map((item) =>
            item.value === "vr"
              ? item
              : {
                  ...item,
                  title: `2D와 3D 바꾸기 (${shortcutText("toggleDimension")})`,
                }
          )}
          value={mode}
          onValueChange={onModeChange}
          aria-label="보기 방식"
        />
        <div className="viewport-toolbar-actions">
          {mode !== "vr" && doors.length > 0 && (
            <MenuRoot
              size="small"
              placement="bottom-end"
              open={doorMenuOpen}
              onOpenChange={(open, details) => {
                if (details?.reason === "itemClick") return
                setDoorMenuOpen(open)
                if (!open) setHighlightedDoorId(null)
              }}
            >
              <MenuTrigger asChild>
                <ActionButton
                  variant="ghost"
                  size="small"
                  aria-label="문 열고 닫기"
                >
                  문
                </ActionButton>
              </MenuTrigger>
              <MenuContent className="door-menu" aria-label="문 열고 닫기">
                {doors.length > 1 && (
                  <MenuGroup>
                    <MenuGroupLabel>모든 문</MenuGroupLabel>
                    <MenuItem
                      label="모두 열기"
                      prefixIcon={<DoorOpen />}
                      disabled={allDoorsOpen}
                      onClick={() => changeAllDoors(true)}
                    />
                    <MenuItem
                      label="모두 닫기"
                      prefixIcon={<DoorClosed />}
                      disabled={allDoorsClosed}
                      onClick={() => changeAllDoors(false)}
                    />
                  </MenuGroup>
                )}
                <MenuGroup>
                  {doors.length > 1 && <MenuGroupLabel>각 문</MenuGroupLabel>}
                  {doors.map((door) => (
                    <MenuItem
                      key={door.id}
                      label={
                        <span className="door-menu-row">
                          <span>{doorLabels?.get(door.id) ?? "문"}</span>
                          <span className="door-menu-row-action">
                            {doorStates[door.id] ? "닫기" : "열기"}
                          </span>
                        </span>
                      }
                      onPointerEnter={() => setHighlightedDoorId(door.id)}
                      onPointerLeave={() => setHighlightedDoorId(null)}
                      onFocus={() => setHighlightedDoorId(door.id)}
                      onBlur={() => setHighlightedDoorId(null)}
                      onClick={() =>
                        onDoorChange(door.id, !doorStates[door.id])
                      }
                    />
                  ))}
                </MenuGroup>
              </MenuContent>
            </MenuRoot>
          )}
          <ActionButton
            variant="ghost"
            size="small"
            layout="iconOnly"
            aria-label="실행 취소"
            title={`실행 취소 (${shortcutText("undo")})`}
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
            title={`다시 실행 (${shortcutText("redo")})`}
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
            title={`${isFullscreen ? "전체 화면 끝내기" : "전체 화면으로 보기"} (${shortcutText("fullscreen")})`}
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
            tool={tool}
            room={project.room}
            focusRoom={focusRoom}
            onSelect={onSelect}
            onMove={onMove}
            onMoveEnd={onMoveEnd}
            onConstrainPose={onConstrainPose}
            onPlace={onPlace}
            doorStates={doorStates}
            highlightedDoorId={highlightedDoorId}
            onDoorChange={onDoorChange}
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
        {minimap && !isMobile && (
          <div className="viewport-overlay overlay-top-end viewport-minimap">
            {minimap}
          </div>
        )}
        {minimap && isMobile && (
          <div className="viewport-overlay viewport-minimap-mobile">
            {isMinimapOpen && (
              <div id="viewport-minimap-panel" className="viewport-minimap">
                {minimap}
              </div>
            )}
            <ActionButton
              ref={minimapButtonRef}
              className="viewport-minimap-toggle"
              variant="neutralWeak"
              size="medium"
              aria-label={isMinimapOpen ? "미니맵 닫기" : "미니맵 열기"}
              aria-expanded={isMinimapOpen}
              aria-controls={
                isMinimapOpen ? "viewport-minimap-panel" : undefined
              }
              onClick={() => setIsMinimapOpen((open) => !open)}
            >
              <Icon svg={<IconMapLine />} size="x5" />
              미니맵
            </ActionButton>
          </div>
        )}
        {mode !== "vr" && (
          <SnackbarAvoidOverlap>
            <div className="viewport-overlay viewport-cursor-dock">
              <div className="viewport-cursor-tools">
                <ToolbarChoice
                  items={cursorTools}
                  value={tool}
                  onValueChange={setTool}
                  aria-label="커서 도구"
                  renderItem={(item, button) => (
                    <HelpBubbleAnchor
                      open={hintTool === item.value}
                      onOpenChange={(open) => !open && hideToolHint()}
                      title={`${item.label} · ${shortcutText(cursorShortcuts[item.value])}`}
                      description={
                        hints[item.value] +
                        (item.value === "pan" && mode === "3d"
                          ? " 오른쪽 버튼을 누르고 끌면 회전해요."
                          : "")
                      }
                      contentProps={{ maxWidth: "20rem" }}
                    >
                      <span
                        className="viewport-cursor-tool"
                        onPointerEnter={(event) => {
                          if (event.pointerType === "mouse")
                            showToolHintSoon(item.value, event.timeStamp)
                        }}
                        onPointerLeave={(event) =>
                          hideToolHint(event.timeStamp)
                        }
                        onPointerDown={() => hideToolHint()}
                        onFocus={(event) => {
                          if (event.target.matches(":focus-visible"))
                            setHintTool(item.value)
                        }}
                        onBlur={() => hideToolHint()}
                      >
                        {button}
                      </span>
                    </HelpBubbleAnchor>
                  )}
                />
              </div>
            </div>
          </SnackbarAvoidOverlap>
        )}
        {mode !== "vr" && !isMobile && (
          <div className="viewport-overlay viewport-cursor-hint" role="status">
            <Type variant="label">
              {hints[tool]}
              {tool === "pan" && mode === "3d"
                ? " 오른쪽 버튼을 누르고 끌면 회전해요."
                : ""}
            </Type>
          </div>
        )}
      </div>
    </section>
  )
}
