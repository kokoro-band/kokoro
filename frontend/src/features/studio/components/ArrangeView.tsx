import { useCallback, useMemo, useRef, useState } from "react"
import {
  IconHouseLine,
  IconPlusLine,
  IconSlider2HorizontalLine,
  IconSparkle2Line,
  IconXmarkLine,
} from "@karrotmarket/react-monochrome-icon"
import { ActionButton, BottomSheet, Icon, PrefixIcon } from "@seed-design/react"
import { ResultSection } from "seed-design/ui/result-section"
import { SnackbarAvoidOverlap } from "seed-design/ui/snackbar"
import { ActionableCallout } from "seed-design/ui/callout"
import {
  TabsContent,
  TabsList,
  TabsRoot,
  TabsTrigger,
} from "seed-design/ui/tabs"

import { Type } from "@/components/kokoro/Type"
import { useShortcut } from "@/features/studio/hooks/useShortcut"
import type { useStudioController } from "@/features/studio/hooks/useStudioController"
import {
  canPlaceFurniture,
  nearestPlacement,
  roomCenter,
} from "@/features/studio/house-navigation"
import { shortcutText } from "@/features/studio/shortcuts"
import { placementIssues } from "@/features/studio/placement-issues"

import { AssistantPanel } from "./AssistantPanel"
import { FurnitureInspector } from "./FurnitureInspector"
import { HouseMap } from "./HouseMap"
import { RoomNavigator } from "./RoomNavigator"
import { SceneEditor } from "./SceneEditor"

type Studio = ReturnType<typeof useStudioController>
type InspectorTab = "selection" | "assistant"
type MobileSheet = "navigator" | "selection" | "assistant" | null

/** 평면도에서 화살표 키가 가리키는 방향. 세로는 아래로 갈수록 커집니다. */
const nudgeDirections: Record<string, [x: number, z: number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
}

function round1(value: number) {
  return Math.round(value * 10) / 10
}

export function ArrangeView({
  studio,
  roomIndex,
  isMobile,
  onRoomChange,
  onOpenStructure,
}: {
  studio: Studio
  roomIndex: number | null
  isMobile: boolean
  onRoomChange: (index: number | null) => void
  onOpenStructure: () => void
}) {
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("selection")
  const [sheet, setSheet] = useState<MobileSheet>(null)
  const houseRoom = studio.project.room
  const rooms = houseRoom?.rooms ?? []
  const room = roomIndex === null ? null : (rooms[roomIndex] ?? null)
  const busy = studio.busy !== null
  const selectStudioFurniture = studio.selectFurniture
  // RoomScene은 onSelect가 바뀌면 장면을 다시 만들기 때문에 참조를 고정합니다.
  const selectFurniture = useCallback(
    (id: string | null) => {
      if (id) setInspectorTab("selection")
      if (isMobile) setSheet(id ? "selection" : null)
      selectStudioFurniture(id)
    },
    [isMobile, selectStudioFurniture]
  )
  // Scene picks don't open the mobile sheet, so it won't cover a drag.
  const selectSceneFurniture = useCallback(
    (id: string | null) => {
      if (id) setInspectorTab("selection")
      selectStudioFurniture(id)
    },
    [selectStudioFurniture]
  )
  const assistantInputRef = useRef<HTMLTextAreaElement>(null)
  const navigatorRef = useRef<HTMLElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const dockPlaceRef = useRef<HTMLButtonElement>(null)
  const selected = studio.selected
  const issues = useMemo(
    () => placementIssues(studio.project),
    [studio.project]
  )
  const selectedIssue = issues.find(
    (issue) => issue.furnitureId === selected?.id
  )
  const selectIssue = (id: string) => {
    onRoomChange(null)
    selectFurniture(id)
  }
  const hasHouse = Boolean(houseRoom && rooms.length > 0)
  const hasSelection = hasHouse && Boolean(selected)

  const changeRoom = (index: number | null) => {
    studio.selectFurniture(null)
    onRoomChange(index)
    if (isMobile && index !== null) setSheet(null)
  }

  /** 집 전체와 방들을 차례로 돕니다. */
  const stepRoom = (step: number) => {
    const count = rooms.length + 1
    const next = (((roomIndex ?? -1) + 1 + step + count) % count) - 1
    changeRoom(next < 0 ? null : next)
  }

  const nudge = (event: KeyboardEvent, distance: number) => {
    const direction = nudgeDirections[event.code]
    if (!selected || !direction) return
    const x = round1(selected.x + direction[0] * distance)
    const z = round1(selected.z + direction[1] * distance)
    if (canPlaceFurniture(studio.project, room, x, z))
      studio.previewSelected({ x, z })
  }

  const rotate = (degrees: number) => {
    if (!selected) return
    studio.updateSelected({
      rotation: (selected.rotation + degrees + 360) % 360,
    })
  }

  /** 입력한 좌표가 방 밖이면 가장 가까운 안쪽 자리로 옮기고, 맞췄는지 알려 줍니다. */
  const placeSelected = (update: { x?: number; z?: number }) => {
    if (!selected) return false
    const target = { x: update.x ?? selected.x, z: update.z ?? selected.z }
    // An out-of-bounds item may need both axes repaired separately. Do not clamp
    // it back to the invalid starting point while the other axis is still outside.
    if (selectedIssue) {
      studio.updateSelected(target)
      return false
    }
    const placed = nearestPlacement(studio.project, room, selected, target)
    if (placed.x !== selected.x || placed.z !== selected.z)
      studio.updateSelected(placed)
    return placed.x !== target.x || placed.z !== target.z
  }

  /** 모바일 시트가 닫히면 사라진 버튼 대신 도크의 첫 버튼으로 포커스를 옮깁니다. */
  const focusDock = () => {
    const active = document.activeElement
    if (
      !active ||
      active === document.body ||
      sheetRef.current?.contains(active)
    )
      dockPlaceRef.current?.focus()
  }

  const deleteSelected = () => {
    if (!selected) return
    const listItems = () =>
      Array.from(
        navigatorRef.current?.querySelectorAll<HTMLElement>(
          "[data-furniture-id]"
        ) ?? []
      )
    const index = listItems().findIndex(
      (item) => item.dataset.furnitureId === selected.id
    )
    studio.deleteSelected()
    if (isMobile) {
      setSheet(null)
      requestAnimationFrame(focusDock)
      return
    }
    // 지운 버튼에 있던 포커스를 목록의 다음 가구로, 목록이 비면 빈 목록의
    // 버튼이나 지금 고른 목록 탭으로 옮깁니다.
    requestAnimationFrame(() => {
      const items = listItems()
      const panel = navigatorRef.current
      const next =
        items[Math.min(Math.max(index, 0), items.length - 1)] ??
        panel?.querySelector<HTMLElement>(".panel-body button") ??
        panel?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
      next?.focus()
    })
  }

  const openAssistant = () => {
    if (isMobile) {
      // 시트 안의 입력창은 열릴 때 autoFocus로 포커스를 받습니다.
      setSheet("assistant")
      return
    }
    setInspectorTab("assistant")
    requestAnimationFrame(() => assistantInputRef.current?.focus())
  }

  useShortcut("nudge", (event) => nudge(event, 0.1), { enabled: hasSelection })
  useShortcut("nudgeFar", (event) => nudge(event, 0.5), {
    enabled: hasSelection,
  })
  // 끌어서 옮길 때처럼 키를 떼면 한 번에 실행 취소 기록으로 남깁니다.
  useShortcut("nudge", studio.commitPreview, { enabled: hasHouse, keyup: true })
  useShortcut("rotate", () => rotate(90), { enabled: hasSelection })
  useShortcut("rotateBack", () => rotate(-90), { enabled: hasSelection })
  useShortcut("deleteFurniture", deleteSelected, { enabled: hasSelection })
  useShortcut(
    "arrangeEscape",
    () => {
      if (selected) selectFurniture(null)
      else changeRoom(null)
    },
    { enabled: hasHouse && (Boolean(selected) || roomIndex !== null) }
  )
  useShortcut("previousRoom", () => stepRoom(-1), { enabled: hasHouse })
  useShortcut("nextRoom", () => stepRoom(1), { enabled: hasHouse })
  useShortcut("focusAssistant", openAssistant, { enabled: hasHouse })

  if (!houseRoom || rooms.length === 0) {
    return (
      <div className="view-empty">
        <ResultSection
          asset={
            <span className="result-asset">
              <Icon svg={<IconHouseLine />} size="x8" />
            </span>
          }
          title="먼저 집 구조를 잡아 주세요"
          description="방을 나누고 나면 방마다 가구를 놓고 2D, 3D, VR로 확인할 수 있어요."
          primaryActionProps={{
            children: "구조 만들기",
            onClick: onOpenStructure,
          }}
        />
      </div>
    )
  }

  const addFurniture = (catalogId: string) => {
    setInspectorTab("selection")
    studio.addFurniture(catalogId, room ? roomCenter(room) : undefined)
    if (isMobile) setSheet("selection")
  }

  const send = (text: string) => studio.sendMessage(text, room?.polygon)

  const navigator = (
    <RoomNavigator
      project={studio.project}
      roomIndex={roomIndex}
      tab={studio.leftTab}
      category={studio.category}
      selectedId={studio.selectedId}
      onRoomChange={changeRoom}
      onTabChange={studio.setLeftTab}
      onCategoryChange={studio.setCategory}
      onAddFurniture={addFurniture}
      onSelectFurniture={selectFurniture}
      issues={issues}
      onSelectIssue={selectIssue}
    />
  )

  const selection = selected ? (
    <FurnitureInspector
      key={selected.id}
      selected={selected}
      issue={selectedIssue?.reason}
      bounds={studio.roomBounds}
      roomName={room?.name ?? null}
      onPlace={placeSelected}
      onPreview={studio.previewSelected}
      onCommitPreview={studio.commitPreview}
      onDelete={deleteSelected}
      onClose={isMobile ? undefined : () => selectFurniture(null)}
    />
  ) : (
    <div className="inspector-empty">
      <Type variant="heading" as="p">
        가구를 골라 보세요
      </Type>
      <Type variant="description" as="p">
        화면이나 목록에서 가구를 누르면 여기서 위치와 방향을 바꿀 수 있어요.
      </Type>
      <ul className="inspector-tips">
        <li>
          <Type variant="description">2번 가구 이동 도구로 끌어서 옮겨요.</Type>
        </li>
        <li>
          <Type variant="description">
            {shortcutText("undo")}로 방금 한 일을 되돌릴 수 있어요.
          </Type>
        </li>
        <li>
          <Type variant="description">
            {shortcutText("guide")}를 누르면 단축키를 모두 볼 수 있어요.
          </Type>
        </li>
      </ul>
    </div>
  )

  const assistant = (
    <AssistantPanel
      messages={studio.messages}
      input={studio.input}
      roomName={room?.name ?? null}
      chatBusy={studio.busy === "chat"}
      busy={busy}
      onInputChange={studio.setInput}
      onSend={send}
      inputRef={assistantInputRef}
      autoFocus={isMobile}
    />
  )

  const scene = (
    <SceneEditor
      project={studio.project}
      focusRoom={room}
      selectedId={studio.selectedId}
      mode={studio.mode}
      isMobile={isMobile}
      canUndo={studio.canUndo}
      canRedo={studio.canRedo}
      onModeChange={studio.setMode}
      onUndo={studio.undo}
      onRedo={studio.redo}
      onFullscreenError={studio.reportFullscreenError}
      onSelect={selectSceneFurniture}
      onMove={studio.moveFurniture}
      onMoveEnd={studio.commitPreview}
      minimap={
        <HouseMap
          room={houseRoom}
          furniture={studio.project.furniture}
          selectedRoom={roomIndex}
          onEnter={changeRoom}
          compact
          keyboardAccessible={isMobile}
        />
      }
    />
  )

  if (isMobile) {
    const sheetTitle =
      sheet === "navigator"
        ? room
          ? `${room.name}에 가구 놓기`
          : "방 고르기"
        : sheet === "assistant"
          ? "AI 배치"
          : "선택한 가구"
    return (
      <div className="arrange arrange-mobile">
        {issues.length > 0 && (
          <ActionableCallout
            tone="critical"
            className="placement-mobile-notice"
            title={`배치 확인 필요 ${issues.length}개`}
            description="가구를 골라 위치를 수정하세요."
            onClick={() => setSheet("navigator")}
          />
        )}
        {scene}
        <SnackbarAvoidOverlap>
          <nav className="mobile-dock" aria-label="배치 도구">
            <ActionButton
              ref={dockPlaceRef}
              variant="neutralWeak"
              size="medium"
              onClick={() => setSheet("navigator")}
            >
              <PrefixIcon svg={room ? <IconPlusLine /> : <IconHouseLine />} />
              {room ? "가구 놓기" : "방 고르기"}
            </ActionButton>
            <ActionButton
              variant="neutralWeak"
              size="medium"
              onClick={openAssistant}
            >
              <PrefixIcon svg={<IconSparkle2Line />} />
              AI 배치
            </ActionButton>
            {selected && (
              <ActionButton
                variant="neutralWeak"
                size="medium"
                onClick={() => setSheet("selection")}
              >
                <PrefixIcon svg={<IconSlider2HorizontalLine />} />
                선택한 가구
              </ActionButton>
            )}
          </nav>
        </SnackbarAvoidOverlap>
        <BottomSheet.Root
          open={sheet !== null}
          onOpenChange={(open) => {
            if (!open) setSheet(null)
          }}
          onAnimationEnd={(open) => {
            if (!open) focusDock()
          }}
        >
          <BottomSheet.Backdrop />
          <BottomSheet.Positioner>
            <BottomSheet.Content ref={sheetRef} className="mobile-sheet">
              <BottomSheet.Header>
                <BottomSheet.Title>{sheetTitle}</BottomSheet.Title>
                <BottomSheet.CloseButton aria-label="닫기">
                  <Icon svg={<IconXmarkLine />} size="x5" />
                </BottomSheet.CloseButton>
              </BottomSheet.Header>
              <BottomSheet.Body
                className="mobile-sheet-body"
                // 방 고르기와 AI 배치는 같은 높이로 열어 화면 위쪽을 남기고,
                // 선택한 가구는 내용만큼 열되 화면을 넘으면 본문을 스크롤합니다.
                height={sheet === "selection" ? undefined : "56dvh"}
                maxHeight={sheet === "selection" ? "72dvh" : "56dvh"}
              >
                {sheet === "navigator" && navigator}
                {sheet === "assistant" && assistant}
                {sheet === "selection" && (
                  <div className="panel">
                    <div className="panel-body">{selection}</div>
                  </div>
                )}
              </BottomSheet.Body>
            </BottomSheet.Content>
          </BottomSheet.Positioner>
        </BottomSheet.Root>
      </div>
    )
  }

  return (
    <div className="arrange">
      <aside
        ref={navigatorRef}
        className="arrange-navigator"
        aria-label="방과 가구"
      >
        {navigator}
      </aside>
      {scene}
      <aside className="arrange-inspector" aria-label="편집 도구">
        <TabsRoot
          className="inspector-tabs"
          value={inspectorTab}
          onValueChange={(value) => setInspectorTab(value as InspectorTab)}
          triggerLayout="fill"
          size="small"
        >
          <TabsList aria-label="편집 도구">
            <TabsTrigger value="selection">선택한 가구</TabsTrigger>
            <TabsTrigger value="assistant">AI 배치</TabsTrigger>
          </TabsList>
          <TabsContent value="selection" className="inspector-panel">
            {selection}
          </TabsContent>
          <TabsContent value="assistant" className="inspector-panel">
            {assistant}
          </TabsContent>
        </TabsRoot>
      </aside>
    </div>
  )
}
