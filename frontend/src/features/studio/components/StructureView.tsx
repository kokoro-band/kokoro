import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import {
  IconArrowUturnLeftLine,
  IconArrowUturnRightLine,
  IconChevronDownLine,
  IconEraserHorizlineLine,
  IconGridLine,
  IconHandPointUpLine,
  IconPictureLine,
  IconPlusLine,
  IconScissorsLine,
  IconTrashcanLine,
  IconWindow4HouseLine,
} from "@karrotmarket/react-monochrome-icon"
import { ActionButton, Icon, PrefixIcon } from "@seed-design/react"
import { Callout } from "seed-design/ui/callout"
import {
  MenuContent,
  MenuGroup,
  MenuItem,
  MenuRoot,
  MenuTrigger,
} from "seed-design/ui/menu"
import { ResultSection } from "seed-design/ui/result-section"
import {
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectRoot,
  SelectTrigger,
} from "seed-design/ui/select"
import { TextField, TextFieldInput } from "seed-design/ui/text-field"

import { SnackbarAvoidOverlap } from "seed-design/ui/snackbar"
import { ToolbarChoice } from "@/components/kokoro/ToolbarChoice"
import { Type } from "@/components/kokoro/Type"
import { useEditorHistory } from "@/features/studio/hooks/useEditorHistory"
import {
  addOpening,
  addRoom,
  buildRoomModel,
  clampArea,
  createDraft,
  draftAreaPyeong,
  draftFromModel,
  fitToArea,
  hasOverlap,
  isConnected,
  labelPoint,
  mergeRooms,
  minRoomSize,
  moveRoom,
  nextRoomName,
  removeOpening,
  removeRoom,
  renameRoom,
  roomsAcrossWall,
  resizeRoom,
  roomPolygon,
  setNotch,
  splitRoom,
  splitSpan,
  type Corner,
  type RoomDraft,
  type RoomRect,
} from "@/features/studio/room-builder"
import type { Opening, RoomModel, Wall } from "@/features/studio/types"

import { MeterField } from "./MeterField"
import { PlanImport } from "./PlanImport"

type Tool = "select" | "split" | "erase" | "opening"

type OpeningType = Opening["type"]

type Axis = "vertical" | "horizontal"

type EditorState = { draft: RoomDraft; openings: Opening[] }

const padding = 0.6
const minFrame = 4
const defaultAreaPyeong = 20

const tools: { id: Tool; label: string; hint: string; icon: ReactNode }[] = [
  {
    id: "select",
    icon: <IconHandPointUpLine />,
    label: "이동",
    hint: "방을 끌어서 옮겨요. 방을 누르면 오른쪽에서 이름과 크기를 바꿀 수 있어요.",
  },
  {
    id: "split",
    icon: <IconScissorsLine />,
    label: "나누기",
    hint: "방 안을 누르면 그 자리에 벽이 생기면서 두 방으로 나뉘어요.",
  },
  {
    id: "erase",
    icon: <IconEraserHorizlineLine />,
    label: "합치기",
    hint: "방 사이의 벽을 누르면 두 방이 하나로 합쳐져요.",
  },
  {
    id: "opening",
    icon: <IconWindow4HouseLine />,
    label: "문·창",
    hint: "벽을 누르면 그 자리에 문이나 창이 생겨요. 다시 누르면 없어져요.",
  },
]

const corners: { id: Corner; label: string }[] = [
  { id: "nw", label: "왼쪽 위" },
  { id: "ne", label: "오른쪽 위" },
  { id: "se", label: "오른쪽 아래" },
  { id: "sw", label: "왼쪽 아래" },
]

function round1(value: number) {
  return Math.round(value * 10) / 10
}

function wallLength(wall: Wall) {
  return Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1])
}

function openingShape(wall: Wall, opening: Opening) {
  const length = wallLength(wall) || 1
  const dx = (wall.b[0] - wall.a[0]) / length
  const dz = (wall.b[1] - wall.a[1]) / length
  const width = opening.to - opening.from
  const start = {
    x: wall.a[0] + dx * opening.from,
    z: wall.a[1] + dz * opening.from,
  }
  const end = { x: wall.a[0] + dx * opening.to, z: wall.a[1] + dz * opening.to }
  const leaf = { x: start.x - dz * width, z: start.z + dx * width }
  return { start, end, leaf, width }
}

function frameFor(areaPyeong: number) {
  const rect = createDraft(clampArea(areaPyeong)).rooms[0]
  return { width: rect.width, depth: rect.depth }
}

function roomAt(rooms: RoomRect[], x: number, z: number) {
  return rooms.find(
    (room) =>
      x >= room.x &&
      x <= room.x + room.width &&
      z >= room.z &&
      z <= room.z + room.depth
  )
}

function notchHandle(room: RoomRect) {
  const notch = room.notch
  if (!notch) return { x: room.x, z: room.z }
  const x =
    notch.corner === "ne" || notch.corner === "se"
      ? room.x + room.width - notch.width
      : room.x + notch.width
  const z =
    notch.corner === "se" || notch.corner === "sw"
      ? room.z + room.depth - notch.depth
      : room.z + notch.depth
  return { x, z }
}

function notchFromPoint(room: RoomRect, corner: Corner, x: number, z: number) {
  const width =
    corner === "ne" || corner === "se" ? room.x + room.width - x : x - room.x
  const depth =
    corner === "se" || corner === "sw" ? room.z + room.depth - z : z - room.z
  return { corner, width, depth }
}

export function StructureView({
  room,
  active,
  saving,
  onApply,
  onDirtyChange,
}: {
  room?: RoomModel
  active: boolean
  saving: boolean
  onApply: (room: RoomModel) => void
  onDirtyChange: (dirty: boolean) => void
}) {
  const [initial] = useState<EditorState>(() => ({
    draft: room ? draftFromModel(room) : createDraft(defaultAreaPyeong),
    openings: room?.openings ?? [],
  }))
  const history = useEditorHistory<EditorState>(() => initial)
  const { draft, openings } = history.present

  const [selectedId, setSelectedId] = useState<string | null>(
    draft.rooms[0]?.id ?? null
  )
  const [tool, setTool] = useState<Tool>("select")
  const [axis, setAxis] = useState<Axis>("vertical")
  const [openingType, setOpeningType] = useState<OpeningType>("door")
  const [preview, setPreview] = useState<{
    id: string
    x: number
    z: number
  } | null>(null)
  const [importing, setImporting] = useState(false)
  const [choosingStart, setChoosingStart] = useState(!room)
  const [areaInput, setAreaInput] = useState(
    room?.source?.areaPyeong ??
      (room ? draftAreaPyeong(draftFromModel(room)) : defaultAreaPyeong)
  )
  const surfaceRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<{
    id: string
    offsetX: number
    offsetZ: number
  } | null>(null)
  const notchDragRef = useRef<string | null>(null)

  const model = useMemo(
    () => buildRoomModel(draft, openings),
    [draft, openings]
  )
  const initialSignature = useMemo(
    () => JSON.stringify(buildRoomModel(initial.draft, initial.openings)),
    [initial]
  )
  const dirty = !room || JSON.stringify(model) !== initialSignature
  const selected = draft.rooms.find((item) => item.id === selectedId)
  const connected = isConnected(draft)
  const overlapping = hasOverlap(draft)
  const currentArea = draftAreaPyeong(draft)
  const targetArea = clampArea(areaInput)
  const offTarget = Math.abs(currentArea - targetArea) >= 0.3
  const activeTool = tools.find((item) => item.id === tool) ?? tools[0]
  const view = {
    width: Math.max(frameFor(areaInput).width, model.bounds.width, minFrame),
    depth: Math.max(frameFor(areaInput).depth, model.bounds.depth, minFrame),
  }
  const viewBox = `${-padding} ${-padding} ${view.width + padding * 2} ${view.depth + padding * 2}`

  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])

  const { undo, redo } = history
  useEffect(() => {
    if (!active) return
    function onKeyDown(event: KeyboardEvent) {
      if (!event.ctrlKey && !event.metaKey) return
      const target = event.target as HTMLElement | null
      if (target?.closest("input, textarea, [contenteditable='true']")) return
      const key = event.key.toLowerCase()
      if (key !== "z" && key !== "y") return
      event.preventDefault()
      if (key === "y" || event.shiftKey) redo()
      else undo()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [active, undo, redo])

  function editDraft(updater: (current: RoomDraft) => RoomDraft, tag?: string) {
    history.set(
      (current) => ({ ...current, draft: updater(current.draft) }),
      tag
    )
  }

  function editOpenings(updater: (current: RoomModel) => RoomModel) {
    history.set((current) => ({
      ...current,
      openings: updater(model).openings,
    }))
  }

  function pointerToPlan(event: React.PointerEvent) {
    const surface = surfaceRef.current
    if (!surface) return null
    const point = surface.createSVGPoint()
    point.x = event.clientX
    point.y = event.clientY
    const matrix = surface.getScreenCTM()
    if (!matrix) return null
    const local = point.matrixTransform(matrix.inverse())
    return { x: local.x, z: local.y }
  }

  function splitAt(id: string, x: number, z: number) {
    editDraft((current) =>
      splitRoom(
        current,
        id,
        axis,
        axis === "vertical" ? x : z,
        nextRoomName(current)
      )
    )
    setPreview(null)
  }

  function startDrag(event: React.PointerEvent, id: string) {
    if (tool === "split") {
      const plan = pointerToPlan(event)
      if (plan) splitAt(id, plan.x, plan.z)
      return
    }
    if (tool !== "select") return
    const plan = pointerToPlan(event)
    const target = draft.rooms.find((item) => item.id === id)
    if (!plan || !target) return
    setSelectedId(id)
    history.mark()
    dragRef.current = {
      id,
      offsetX: plan.x - target.x,
      offsetZ: plan.z - target.z,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function dragRoom(event: React.PointerEvent) {
    const plan = pointerToPlan(event)
    if (!plan) return

    if (tool === "split") {
      const target = roomAt(draft.rooms, plan.x, plan.z)
      setPreview(target ? { id: target.id, x: plan.x, z: plan.z } : null)
      return
    }

    const notchId = notchDragRef.current
    if (notchId) {
      history.replace((current) => {
        const target = current.draft.rooms.find((item) => item.id === notchId)
        if (!target?.notch) return current
        return {
          ...current,
          draft: setNotch(
            current.draft,
            notchId,
            notchFromPoint(target, target.notch.corner, plan.x, plan.z)
          ),
        }
      })
      return
    }

    const drag = dragRef.current
    if (!drag) return
    history.replace((current) => ({
      ...current,
      draft: moveRoom(
        current.draft,
        drag.id,
        plan.x - drag.offsetX,
        plan.z - drag.offsetZ
      ),
    }))
  }

  function startNotchDrag(event: React.PointerEvent, id: string) {
    notchDragRef.current = id
    history.mark()
    event.currentTarget.setPointerCapture(event.pointerId)
    event.stopPropagation()
  }

  function importPlan(next: RoomDraft, areaPyeong: number) {
    history.reset({ draft: next, openings: [] })
    setAreaInput(areaPyeong)
    setSelectedId(next.rooms[0]?.id ?? null)
    setTool("select")
    setImporting(false)
    setChoosingStart(false)
  }

  function fitArea() {
    history.set((current) => {
      const walls = buildRoomModel(current.draft, current.openings).walls
      const result = fitToArea(
        current.draft,
        targetArea,
        current.openings,
        walls
      )
      return { draft: result.draft, openings: result.openings }
    })
  }

  function restart() {
    const next = createDraft(clampArea(areaInput))
    history.reset({ draft: next, openings: [] })
    setSelectedId(next.rooms[0].id)
    setTool("select")
    setChoosingStart(false)
  }

  function revert() {
    history.reset(initial)
    setSelectedId(initial.draft.rooms[0]?.id ?? null)
  }

  function endDrag() {
    dragRef.current = null
    notchDragRef.current = null
  }

  function toggleShape(target: RoomRect, corner: Corner | null) {
    editDraft((current) =>
      setNotch(
        current,
        target.id,
        corner
          ? {
              corner,
              width: round1(target.width / 3),
              depth: round1(target.depth / 3),
            }
          : undefined
      )
    )
  }

  function eraseWall(wall: Wall) {
    editDraft((current) => {
      const pair = roomsAcrossWall(current, wall)
      if (!pair) return current
      return mergeRooms(current, pair[0], pair[1])
    })
  }

  function placeOpening(wall: Wall, event: React.PointerEvent) {
    if (tool !== "opening") return
    const plan = pointerToPlan(event)
    if (!plan) return
    const length = wallLength(wall)
    const along =
      ((plan.x - wall.a[0]) * (wall.b[0] - wall.a[0]) +
        (plan.z - wall.a[1]) * (wall.b[1] - wall.a[1])) /
      (length || 1)
    editOpenings((current) => addOpening(current, wall.id, openingType, along))
  }

  function dropOpening(openingId: string) {
    if (tool !== "opening") return
    editOpenings((current) => removeOpening(current, openingId))
  }

  return (
    <div className="structure">
      <section className="viewport" aria-label="집 구조 편집">
        <div className="viewport-toolbar">
          <div className="viewport-toolbar-group">
            <ToolbarChoice
              items={tools.map((item) => ({
                value: item.id,
                label: item.label,
                icon: item.icon,
              }))}
              value={tool}
              onValueChange={setTool}
              aria-label="편집 도구"
            />
            {tool === "split" && (
              <>
                <span className="toolbar-divider" aria-hidden="true" />
                <ToolbarChoice
                  items={[
                    { value: "vertical", label: "세로로" },
                    { value: "horizontal", label: "가로로" },
                  ]}
                  value={axis}
                  onValueChange={setAxis}
                  aria-label="나누는 방향"
                />
              </>
            )}
            {tool === "opening" && (
              <>
                <span className="toolbar-divider" aria-hidden="true" />
                <ToolbarChoice
                  items={[
                    { value: "door", label: "문" },
                    { value: "window", label: "창" },
                  ]}
                  value={openingType}
                  onValueChange={setOpeningType}
                  aria-label="만들 개구부"
                />
              </>
            )}
          </div>
          <div className="viewport-toolbar-actions">
            <ActionButton
              variant="ghost"
              size="small"
              onClick={() =>
                editDraft((current) => addRoom(current, nextRoomName(current)))
              }
            >
              <PrefixIcon svg={<IconPlusLine />} />방 추가
            </ActionButton>
            <MenuRoot size="small" placement="bottom-end">
              <MenuTrigger asChild>
                <ActionButton variant="ghost" size="small">
                  새로 시작
                  <Icon svg={<IconChevronDownLine />} size="x4" />
                </ActionButton>
              </MenuTrigger>
              <MenuContent>
                <MenuGroup>
                  <MenuItem
                    label="도면 이미지로 시작"
                    description="도면을 읽어 방 배치 초안을 만들어요"
                    prefixIcon={<IconPictureLine />}
                    onClick={() => setImporting(true)}
                  />
                  <MenuItem
                    label="평수로 새로 그리기"
                    description={`전용면적 ${targetArea}평짜리 빈 집에서 시작해요`}
                    prefixIcon={<IconGridLine />}
                    onClick={restart}
                  />
                </MenuGroup>
              </MenuContent>
            </MenuRoot>
            <span className="toolbar-divider" aria-hidden="true" />
            <ActionButton
              variant="ghost"
              size="small"
              layout="iconOnly"
              aria-label="실행 취소"
              title="실행 취소 (Ctrl+Z)"
              disabled={!history.canUndo}
              onClick={history.undo}
            >
              <Icon svg={<IconArrowUturnLeftLine />} size="x5" />
            </ActionButton>
            <ActionButton
              variant="ghost"
              size="small"
              layout="iconOnly"
              aria-label="다시 실행"
              title="다시 실행 (Ctrl+Shift+Z)"
              disabled={!history.canRedo}
              onClick={history.redo}
            >
              <Icon svg={<IconArrowUturnRightLine />} size="x5" />
            </ActionButton>
          </div>
        </div>

        <div className="viewport-canvas structure-canvas">
          <svg
            ref={surfaceRef}
            className="plan-surface"
            data-tool={tool}
            viewBox={viewBox}
            onPointerMove={dragRoom}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onPointerLeave={() => setPreview(null)}
            aria-label="방 배치 편집기"
          >
            <defs>
              <pattern
                id="plan-grid"
                width={1}
                height={1}
                patternUnits="userSpaceOnUse"
              >
                <path className="plan-grid-line" d="M 1 0 L 0 0 L 0 1" />
              </pattern>
            </defs>
            <rect
              className="plan-grid"
              x={-padding}
              y={-padding}
              width={view.width + padding * 2}
              height={view.depth + padding * 2}
              fill="url(#plan-grid)"
            />

            {draft.rooms.map((item) => {
              const polygon = roomPolygon(item)
              const [labelX, labelZ] = labelPoint(polygon)
              return (
                <g key={item.id}>
                  <polygon
                    className={`plan-room${item.id === selectedId ? " is-selected" : ""}`}
                    points={polygon
                      .map((point) => `${point[0]},${point[1]}`)
                      .join(" ")}
                    onPointerDown={(event) => startDrag(event, item.id)}
                  />
                  <text className="plan-room-label" x={labelX} y={labelZ}>
                    {item.name}
                  </text>
                </g>
              )
            })}

            {preview &&
              (() => {
                const target = draft.rooms.find(
                  (item) => item.id === preview.id
                )
                if (!target) return null
                const vertical = axis === "vertical"
                const fits = vertical
                  ? target.width >= minRoomSize * 2
                  : target.depth >= minRoomSize * 2
                if (!fits) return null
                const cut = vertical
                  ? Math.min(
                      Math.max(preview.x, target.x + minRoomSize),
                      target.x + target.width - minRoomSize
                    )
                  : Math.min(
                      Math.max(preview.z, target.z + minRoomSize),
                      target.z + target.depth - minRoomSize
                    )
                const span = splitSpan(target, axis, cut)
                if (!span) return null
                return (
                  <line
                    className="plan-split-preview"
                    x1={vertical ? cut : span[0]}
                    y1={vertical ? span[0] : cut}
                    x2={vertical ? cut : span[1]}
                    y2={vertical ? span[1] : cut}
                  />
                )
              })()}

            {selected?.notch && tool === "select" && (
              <circle
                className="plan-notch-handle"
                cx={notchHandle(selected).x}
                cy={notchHandle(selected).z}
                r={0.22}
                onPointerDown={(event) => startNotchDrag(event, selected.id)}
              />
            )}

            {model.walls.map((wall) => (
              <line
                key={wall.id}
                className="plan-wall"
                x1={wall.a[0]}
                y1={wall.a[1]}
                x2={wall.b[0]}
                y2={wall.b[1]}
                strokeWidth={wall.thickness}
                onPointerDown={(event) => {
                  if (tool === "erase") eraseWall(wall)
                  else placeOpening(wall, event)
                }}
              />
            ))}

            {model.openings.map((opening) => {
              const wall = model.walls.find(
                (item) => item.id === opening.wallId
              )
              if (!wall) return null
              const shape = openingShape(wall, opening)
              return (
                <g
                  key={opening.id}
                  className={`plan-opening is-${opening.type}`}
                  onPointerDown={() => dropOpening(opening.id)}
                >
                  <line
                    className="plan-opening-gap"
                    x1={shape.start.x}
                    y1={shape.start.z}
                    x2={shape.end.x}
                    y2={shape.end.z}
                    strokeWidth={wall.thickness + 0.02}
                  />
                  {opening.type === "door" ? (
                    <path
                      className="plan-door-swing"
                      d={`M ${shape.end.x} ${shape.end.z} A ${shape.width} ${shape.width} 0 0 1 ${shape.leaf.x} ${shape.leaf.z} L ${shape.start.x} ${shape.start.z}`}
                    />
                  ) : (
                    <line
                      className="plan-window-glass"
                      x1={shape.start.x}
                      y1={shape.start.z}
                      x2={shape.end.x}
                      y2={shape.end.z}
                      strokeWidth={wall.thickness * 0.4}
                    />
                  )}
                </g>
              )
            })}
          </svg>

          {active ? (
            <SnackbarAvoidOverlap>
              <div className="viewport-overlay overlay-bottom-start viewport-hint">
                <Type variant="caption">{activeTool.hint}</Type>
              </div>
            </SnackbarAvoidOverlap>
          ) : null}

          {choosingStart && (
            <div className="structure-start">
              <div className="structure-start-card">
                <ResultSection
                  size="medium"
                  asset={
                    <span className="result-asset">
                      <Icon svg={<IconPictureLine />} size="x8" />
                    </span>
                  }
                  title="집 구조부터 잡아 볼까요?"
                  description="도면 이미지가 있으면 방을 찾아 초안을 만들어 드려요. 없어도 빈 집에서 방을 나누며 그릴 수 있어요."
                  primaryActionProps={{
                    children: "도면 이미지로 시작",
                    onClick: () => setImporting(true),
                  }}
                  secondaryActionProps={{
                    children: "빈 집에서 그리기",
                    onClick: () => setChoosingStart(false),
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </section>

      <aside className="structure-inspector panel" aria-label="구조 정보">
        <div className="panel-body">
          <section
            className="inspector-section"
            aria-labelledby="room-section-title"
          >
            <div className="inspector-section-heading">
              <Type variant="heading" as="h2" id="room-section-title">
                {selected ? "선택한 방" : "방"}
              </Type>
              {selected && (
                <ActionButton
                  variant="ghost"
                  size="small"
                  color="fg.critical"
                  disabled={draft.rooms.length <= 1}
                  onClick={() => {
                    editDraft((current) => removeRoom(current, selected.id))
                    setSelectedId(null)
                  }}
                >
                  <PrefixIcon svg={<IconTrashcanLine />} />
                  삭제
                </ActionButton>
              )}
            </div>
            {selected ? (
              <>
                <TextField
                  label="이름"
                  size="medium"
                  value={selected.name}
                  onValueChange={({ value }) =>
                    editDraft(
                      (current) => renameRoom(current, selected.id, value),
                      `name:${selected.id}`
                    )
                  }
                >
                  <TextFieldInput maxLength={20} />
                </TextField>
                <div className="field-pair">
                  <MeterField
                    key={`w-${selected.id}`}
                    label="가로"
                    value={selected.width}
                    min={minRoomSize}
                    max={40}
                    onCommit={(width) =>
                      editDraft((current) =>
                        resizeRoom(current, selected.id, width, selected.depth)
                      )
                    }
                  />
                  <MeterField
                    key={`d-${selected.id}`}
                    label="세로"
                    value={selected.depth}
                    min={minRoomSize}
                    max={40}
                    onCommit={(depth) =>
                      editDraft((current) =>
                        resizeRoom(current, selected.id, selected.width, depth)
                      )
                    }
                  />
                </div>
                <div className="field-stack">
                  <Type variant="label" as="span">
                    모양
                  </Type>
                  <ToolbarChoice
                    items={[
                      { value: "rect", label: "ㅁ자" },
                      { value: "notch", label: "ㄱ자" },
                    ]}
                    value={selected.notch ? "notch" : "rect"}
                    onValueChange={(value) =>
                      toggleShape(
                        selected,
                        value === "notch"
                          ? (selected.notch?.corner ?? "ne")
                          : null
                      )
                    }
                    aria-label="방 모양"
                  />
                </div>
                {selected.notch && (
                  <SelectRoot
                    label="깎을 모서리"
                    value={[selected.notch.corner]}
                    onValueChange={([corner]) => {
                      if (corner) toggleShape(selected, corner as Corner)
                    }}
                    size="medium"
                  >
                    <SelectTrigger />
                    <SelectContent>
                      <SelectGroup>
                        {corners.map((corner) => (
                          <SelectItem
                            key={corner.id}
                            value={corner.id}
                            label={corner.label}
                          />
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </SelectRoot>
                )}
              </>
            ) : (
              <Type variant="description" as="p">
                이동 도구로 방을 누르면 이름과 크기를 바꿀 수 있어요.
              </Type>
            )}
          </section>

          <section
            className="inspector-section"
            aria-labelledby="house-section-title"
          >
            <Type variant="heading" as="h2" id="house-section-title">
              집 전체
            </Type>
            <dl className="stat-list">
              <div>
                <Type variant="description" as="dt">
                  크기
                </Type>
                <Type variant="label" as="dd" numeric>
                  {model.bounds.width.toFixed(1)} ×{" "}
                  {model.bounds.depth.toFixed(1)} m
                </Type>
              </div>
              <div>
                <Type variant="description" as="dt">
                  방
                </Type>
                <Type variant="label" as="dd" numeric>
                  {draft.rooms.length}개
                </Type>
              </div>
              <div>
                <Type variant="description" as="dt">
                  지금 면적
                </Type>
                <Type
                  variant="label"
                  as="dd"
                  numeric
                  color={offTarget ? "fg.warning" : undefined}
                >
                  {currentArea}평
                </Type>
              </div>
            </dl>
            <MeterField
              label="전용면적"
              value={areaInput}
              min={5}
              max={100}
              step={1}
              suffix="평"
              onCommit={setAreaInput}
            />
            <Type variant="caption" as="p">
              34평형 아파트의 전용면적은 약 25평이에요.
            </Type>
            <ActionButton
              variant="neutralWeak"
              size="small"
              disabled={!offTarget}
              onClick={fitArea}
            >
              모든 방을 {targetArea}평에 맞추기
            </ActionButton>
          </section>

          {(!connected || overlapping) && (
            <div className="inspector-section">
              {!connected && (
                <Callout
                  tone="critical"
                  title="떨어진 방이 있어요"
                  description="모든 방이 벽을 맞대고 이어져 있어야 저장할 수 있어요."
                />
              )}
              {overlapping && (
                <Callout
                  tone="critical"
                  title="겹친 방이 있어요"
                  description="서로 겹친 방을 옮겨서 벽끼리 맞닿게 해 주세요."
                />
              )}
            </div>
          )}
        </div>
        <footer className="panel-footer structure-actions">
          <ActionButton
            variant="neutralWeak"
            size="medium"
            disabled={!room || !dirty}
            onClick={revert}
          >
            되돌리기
          </ActionButton>
          <ActionButton
            variant="brandSolid"
            size="medium"
            disabled={!connected || overlapping || !dirty || saving}
            loading={saving}
            onClick={() => onApply(model)}
          >
            {room ? "구조 저장" : "이 구조로 시작"}
          </ActionButton>
        </footer>
      </aside>

      {importing && (
        <PlanImport
          initialArea={clampArea(areaInput)}
          onImport={importPlan}
          onClose={() => setImporting(false)}
        />
      )}
    </div>
  )
}
