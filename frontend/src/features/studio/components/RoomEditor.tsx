import { useEffect, useMemo, useRef, useState } from "react"
import {
  ChevronDown,
  Columns2,
  DoorOpen,
  FileImage,
  Plus,
  RectangleHorizontal,
  Redo2,
  RotateCcw,
  Eraser,
  Rows2,
  Scaling,
  Scissors,
  Trash2,
  Undo2,
  X,
} from "lucide-react"

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

import { PlanImport } from "./PlanImport"

type Tool = "select" | "split" | "erase" | "door" | "window"

type Axis = "vertical" | "horizontal"

type EditorState = { draft: RoomDraft; openings: Opening[] }

const padding = 0.6
const minFrame = 4
const defaultAreaPyeong = 20

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

export function RoomEditor({
  room,
  onApply,
  onClose,
}: {
  room?: RoomModel
  onApply: (room: RoomModel) => void
  onClose: () => void
}) {
  const history = useEditorHistory<EditorState>(() => ({
    draft: room ? draftFromModel(room) : createDraft(defaultAreaPyeong),
    openings: room?.openings ?? [],
  }))
  const { draft, openings } = history.present

  const [selectedId, setSelectedId] = useState<string | null>(
    draft.rooms[0]?.id ?? null
  )
  const [tool, setTool] = useState<Tool>("select")
  const [axis, setAxis] = useState<Axis>("vertical")
  const [preview, setPreview] = useState<{
    id: string
    x: number
    z: number
  } | null>(null)
  const [importing, setImporting] = useState(false)
  const [startMenu, setStartMenu] = useState(false)
  const startRef = useRef<HTMLDivElement>(null)
  const [areaInput, setAreaInput] = useState(
    room?.source?.areaPyeong ?? defaultAreaPyeong
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
  const selected = draft.rooms.find((item) => item.id === selectedId)
  const connected = isConnected(draft)
  const overlapping = hasOverlap(draft)
  const currentArea = draftAreaPyeong(draft)
  const targetArea = clampArea(areaInput)
  const offTarget = Math.abs(currentArea - targetArea) >= 0.3
  const view = {
    width: Math.max(frameFor(areaInput).width, model.bounds.width, minFrame),
    depth: Math.max(frameFor(areaInput).depth, model.bounds.depth, minFrame),
  }
  const viewBox = `${-padding} ${-padding} ${view.width + padding * 2} ${view.depth + padding * 2}`

  useEffect(() => {
    if (!startMenu) return
    function onPointerDown(event: PointerEvent) {
      if (!startRef.current?.contains(event.target as Node)) setStartMenu(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setStartMenu(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [startMenu])

  const { undo, redo } = history
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!event.ctrlKey && !event.metaKey) return
      const key = event.key.toLowerCase()
      if (key !== "z" && key !== "y") return
      event.preventDefault()
      if (key === "y" || event.shiftKey) redo()
      else undo()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [undo, redo])

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
    if (tool !== "door" && tool !== "window") return
    const plan = pointerToPlan(event)
    if (!plan) return
    const length = wallLength(wall)
    const along =
      ((plan.x - wall.a[0]) * (wall.b[0] - wall.a[0]) +
        (plan.z - wall.a[1]) * (wall.b[1] - wall.a[1])) /
      (length || 1)
    editOpenings((current) => addOpening(current, wall.id, tool, along))
  }

  function dropOpening(openingId: string) {
    editOpenings((current) => removeOpening(current, openingId))
  }

  return (
    <div className="room-editor">
      <header className="room-editor-header">
        <div>
          <strong>공간 만들기</strong>
          <span>
            {model.bounds.width.toFixed(1)} × {model.bounds.depth.toFixed(1)} m
            · 방 {draft.rooms.length}개 ·{" "}
            <b className={offTarget ? "room-editor-off" : ""}>
              {currentArea}평
            </b>
            {offTarget && ` (전용면적 ${targetArea}평)`}
          </span>
        </div>
        <div className="room-editor-history">
          <button
            className="icon-button"
            type="button"
            aria-label="되돌리기"
            title="되돌리기 (Ctrl+Z)"
            disabled={!history.canUndo}
            onClick={history.undo}
          >
            <Undo2 size={16} />
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label="다시 실행"
            title="다시 실행 (Ctrl+Shift+Z)"
            disabled={!history.canRedo}
            onClick={history.redo}
          >
            <Redo2 size={16} />
          </button>
          <button
            className="icon-button"
            aria-label="편집 닫기"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>
      </header>

      <div className="room-editor-tools">
        <div className="room-editor-start" ref={startRef}>
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={startMenu}
            onClick={() => setStartMenu((open) => !open)}
          >
            새로 시작
            <ChevronDown size={14} />
          </button>
          {startMenu && (
            <div className="room-editor-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setStartMenu(false)
                  restart()
                }}
              >
                <RotateCcw size={14} />
                <span>
                  <strong>평수로 시작</strong>
                  <small>전용면적 {targetArea}평짜리 빈 집</small>
                </span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setStartMenu(false)
                  setImporting(true)
                }}
              >
                <FileImage size={14} />
                <span>
                  <strong>도면으로 시작</strong>
                  <small>도면 이미지에서 방 배치 초안</small>
                </span>
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() =>
            editDraft((current) => addRoom(current, nextRoomName(current)))
          }
        >
          <Plus size={14} />방 추가
        </button>
        {tool === "split" && (
          <div
            className="room-editor-axis"
            role="group"
            aria-label="쪼개는 방향"
          >
            {(
              [
                { id: "vertical", label: "세로선", icon: Columns2 },
                { id: "horizontal", label: "가로선", icon: Rows2 },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={axis === item.id}
                className={axis === item.id ? "active" : ""}
                onClick={() => setAxis(item.id)}
              >
                <item.icon size={14} />
                {item.label}
              </button>
            ))}
          </div>
        )}
        <div className="room-editor-modes" role="group" aria-label="편집 도구">
          {(
            [
              { id: "select", label: "이동", icon: RectangleHorizontal },
              { id: "split", label: "쪼개기", icon: Scissors },
              { id: "erase", label: "벽 지우기", icon: Eraser },
              { id: "door", label: "문", icon: DoorOpen },
              { id: "window", label: "창", icon: RectangleHorizontal },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={tool === item.id}
              className={tool === item.id ? "active" : ""}
              onClick={() => setTool(item.id)}
            >
              <item.icon size={14} />
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <svg
        ref={surfaceRef}
        className="room-editor-surface"
        viewBox={viewBox}
        onPointerMove={dragRoom}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={() => setPreview(null)}
        aria-label="방 배치 편집기"
      >
        <defs>
          <pattern
            id="room-editor-grid"
            width={1}
            height={1}
            patternUnits="userSpaceOnUse"
          >
            <path className="room-grid-line" d="M 1 0 L 0 0 L 0 1" />
          </pattern>
        </defs>
        <rect
          className="room-grid"
          x={-padding}
          y={-padding}
          width={view.width + padding * 2}
          height={view.depth + padding * 2}
          fill="url(#room-editor-grid)"
        />

        {draft.rooms.map((item) => (
          <g key={item.id}>
            <polygon
              className={`room-block${item.id === selectedId ? " selected" : ""}`}
              points={roomPolygon(item)
                .map((point) => `${point[0]},${point[1]}`)
                .join(" ")}
              onPointerDown={(event) => startDrag(event, item.id)}
            />
            <text
              className="room-block-label"
              x={labelPoint(roomPolygon(item))[0]}
              y={labelPoint(roomPolygon(item))[1]}
            >
              {item.name}
            </text>
          </g>
        ))}

        {preview &&
          (() => {
            const target = draft.rooms.find((item) => item.id === preview.id)
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
                className="room-split-preview"
                x1={vertical ? cut : span[0]}
                y1={vertical ? span[0] : cut}
                x2={vertical ? cut : span[1]}
                y2={vertical ? span[1] : cut}
              />
            )
          })()}

        {selected?.notch && (
          <circle
            className="room-notch-handle"
            cx={notchHandle(selected).x}
            cy={notchHandle(selected).z}
            r={0.22}
            onPointerDown={(event) => startNotchDrag(event, selected.id)}
          />
        )}

        {model.walls.map((wall) => (
          <line
            key={wall.id}
            className={`room-wall${tool === "door" || tool === "window" ? " placing" : ""}${tool === "erase" ? " erasing" : ""}`}
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
          const wall = model.walls.find((item) => item.id === opening.wallId)
          if (!wall) return null
          const shape = openingShape(wall, opening)
          return (
            <g
              key={opening.id}
              className={`room-opening ${opening.type}`}
              onPointerDown={() => dropOpening(opening.id)}
            >
              <line
                className="room-opening-gap"
                x1={shape.start.x}
                y1={shape.start.z}
                x2={shape.end.x}
                y2={shape.end.z}
                strokeWidth={wall.thickness + 0.02}
              />
              {opening.type === "door" ? (
                <path
                  className="room-door-swing"
                  d={`M ${shape.end.x} ${shape.end.z} A ${shape.width} ${shape.width} 0 0 1 ${shape.leaf.x} ${shape.leaf.z} L ${shape.start.x} ${shape.start.z}`}
                />
              ) : (
                <line
                  className="room-window-glass"
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

      <footer className="room-editor-footer">
        {selected && tool === "select" ? (
          <div className="room-editor-fields">
            <label>
              이름
              <input
                value={selected.name}
                onChange={(event) =>
                  editDraft(
                    (current) =>
                      renameRoom(current, selected.id, event.target.value),
                    `name:${selected.id}`
                  )
                }
              />
            </label>
            <label>
              가로
              <input
                type="number"
                min={minRoomSize}
                step={0.1}
                value={selected.width}
                onChange={(event) =>
                  editDraft(
                    (current) =>
                      resizeRoom(
                        current,
                        selected.id,
                        Number(event.target.value),
                        selected.depth
                      ),
                    `size:${selected.id}`
                  )
                }
              />
            </label>
            <label>
              세로
              <input
                type="number"
                min={minRoomSize}
                step={0.1}
                value={selected.depth}
                onChange={(event) =>
                  editDraft(
                    (current) =>
                      resizeRoom(
                        current,
                        selected.id,
                        selected.width,
                        Number(event.target.value)
                      ),
                    `size:${selected.id}`
                  )
                }
              />
            </label>
            <div
              className="room-shape-picker"
              role="group"
              aria-label="방 모양"
            >
              <button
                type="button"
                aria-pressed={!selected.notch}
                className={selected.notch ? "" : "active"}
                onClick={() => toggleShape(selected, null)}
              >
                ㅁ자
              </button>
              <button
                type="button"
                aria-pressed={Boolean(selected.notch)}
                className={selected.notch ? "active" : ""}
                onClick={() =>
                  toggleShape(selected, selected.notch?.corner ?? "ne")
                }
              >
                ㄱ자
              </button>
              {selected.notch && (
                <select
                  aria-label="깎을 모서리"
                  value={selected.notch.corner}
                  onChange={(event) =>
                    toggleShape(selected, event.target.value as Corner)
                  }
                >
                  <option value="nw">왼쪽 위</option>
                  <option value="ne">오른쪽 위</option>
                  <option value="se">오른쪽 아래</option>
                  <option value="sw">왼쪽 아래</option>
                </select>
              )}
            </div>
            <button
              type="button"
              className="icon-button danger"
              aria-label="선택한 방 삭제"
              disabled={draft.rooms.length <= 1}
              onClick={() => {
                editDraft((current) => removeRoom(current, selected.id))
                setSelectedId(null)
              }}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ) : (
          <p className="room-editor-hint">
            {tool === "split"
              ? "방 안을 누르면 그 자리에 벽이 생기면서 두 방으로 나뉩니다."
              : tool === "erase"
                ? "방 사이의 벽을 누르면 두 방이 하나로 합쳐집니다."
                : "방을 선택하면 이름과 크기를 바꿀 수 있습니다."}
          </p>
        )}
        <div className="room-editor-actions">
          {!connected && (
            <p className="room-editor-warning" role="alert">
              떨어진 방이 있습니다. 모든 방을 서로 붙여 주세요.
            </p>
          )}
          {overlapping && (
            <p className="room-editor-warning" role="alert">
              겹쳐 있는 방이 있습니다. 서로 붙여서 떨어뜨려 주세요.
            </p>
          )}
          <div className="room-editor-area">
            <label title="34평형 아파트의 전용면적은 약 25평입니다">
              전용면적
              <input
                type="number"
                min={5}
                max={100}
                step={1}
                value={areaInput}
                onChange={(event) => setAreaInput(Number(event.target.value))}
              />
              평
            </label>
            <button
              type="button"
              disabled={!offTarget}
              title="모든 방을 같은 비율로 키우거나 줄여 전용면적에 맞춥니다"
              onClick={fitArea}
            >
              <Scaling size={14} />
              맞추기
            </button>
          </div>
          <button
            type="button"
            className="room-editor-apply"
            disabled={!connected || overlapping}
            onClick={() => onApply(model)}
          >
            이 구조로 만들기
          </button>
        </div>
      </footer>

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
