import { useCallback, useState } from "react"
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
import {
  TabsContent,
  TabsList,
  TabsRoot,
  TabsTrigger,
} from "seed-design/ui/tabs"

import { Type } from "@/components/kokoro/Type"
import type { useStudioController } from "@/features/studio/hooks/useStudioController"
import { roomCenter } from "@/features/studio/house-navigation"

import { AssistantPanel } from "./AssistantPanel"
import { FurnitureInspector } from "./FurnitureInspector"
import { HouseMap } from "./HouseMap"
import { RoomNavigator } from "./RoomNavigator"
import { SceneEditor } from "./SceneEditor"

type Studio = ReturnType<typeof useStudioController>
type InspectorTab = "selection" | "assistant"
type MobileSheet = "navigator" | "selection" | "assistant" | null

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

  const changeRoom = (index: number | null) => {
    studio.selectFurniture(null)
    onRoomChange(index)
    if (isMobile && index !== null) setSheet(null)
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
    />
  )

  const selection = studio.selected ? (
    <FurnitureInspector
      key={studio.selected.id}
      selected={studio.selected}
      bounds={studio.roomBounds}
      onUpdate={studio.updateSelected}
      onPreview={studio.previewSelected}
      onCommitPreview={studio.commitPreview}
      onDelete={() => {
        studio.deleteSelected()
        if (isMobile) setSheet(null)
      }}
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
          <Type variant="description">가구를 끌면 바로 옮겨져요.</Type>
        </li>
        <li>
          <Type variant="description">
            Ctrl+Z로 방금 한 일을 되돌릴 수 있어요.
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
    />
  )

  const scene = (
    <SceneEditor
      project={studio.project}
      focusRoom={room}
      selectedId={studio.selectedId}
      mode={studio.mode}
      canUndo={studio.canUndo}
      canRedo={studio.canRedo}
      onModeChange={studio.setMode}
      onUndo={studio.undo}
      onRedo={studio.redo}
      onFullscreenError={studio.reportFullscreenError}
      onSelect={selectFurniture}
      onMove={studio.moveFurniture}
      onMoveEnd={studio.commitPreview}
      minimap={
        <HouseMap
          room={houseRoom}
          furniture={studio.project.furniture}
          selectedRoom={roomIndex}
          onEnter={changeRoom}
          compact
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
        {scene}
        <SnackbarAvoidOverlap>
          <nav className="mobile-dock" aria-label="배치 도구">
            <ActionButton
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
              onClick={() => setSheet("assistant")}
            >
              <PrefixIcon svg={<IconSparkle2Line />} />
              AI 배치
            </ActionButton>
            {studio.selected && (
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
        >
          <BottomSheet.Backdrop />
          <BottomSheet.Positioner>
            <BottomSheet.Content className="mobile-sheet">
              <BottomSheet.Header>
                <BottomSheet.Title>{sheetTitle}</BottomSheet.Title>
                <BottomSheet.CloseButton aria-label="닫기">
                  <Icon svg={<IconXmarkLine />} size="x5" />
                </BottomSheet.CloseButton>
              </BottomSheet.Header>
              <BottomSheet.Body
                className="mobile-sheet-body"
                // 방 고르기와 AI 배치는 같은 높이로 열어 화면 위쪽을 남기고,
                // 선택한 가구는 내용만큼만 엽니다.
                height={sheet === "selection" ? undefined : "56dvh"}
                maxHeight="56dvh"
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
      <aside className="arrange-navigator" aria-label="방과 가구">
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
