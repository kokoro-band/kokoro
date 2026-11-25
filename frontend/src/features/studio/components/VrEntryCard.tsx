import type { ReactNode, RefObject } from "react"
import { ActionButton } from "@seed-design/react"
import { Glasses } from "lucide-react"

import { Type } from "@/components/kokoro/Type"
import { roomAtPoint } from "../house-navigation"
import type { RoomLabel, RoomModel } from "../types"

export function VrEntryCard({
  room,
  focusRoom,
  minimap,
  entryRef,
  onReturn,
}: {
  room?: RoomModel
  focusRoom: RoomLabel | null
  minimap?: ReactNode
  entryRef: RefObject<HTMLDivElement | null>
  onReturn: () => void
}) {
  const spawn = room?.spawn ?? [
    (room?.bounds.width ?? 0) / 2,
    (room?.bounds.depth ?? 0) / 2,
  ]
  const startRoom =
    focusRoom ??
    (room && room.rooms[roomAtPoint(room.rooms, spawn[0], spawn[1])])
  return (
    <div className="viewport-overlay vr-entry-overlay">
      <section className="vr-entry-card" aria-labelledby="vr-entry-title">
        <header>
          <Glasses size={24} strokeWidth={1.65} aria-hidden />
          <div>
            <Type variant="title" as="h2" id="vr-entry-title">
              VR 둘러보기
            </Type>
            <Type variant="description" as="p">
              {startRoom
                ? `${startRoom.name}에서 시작해요.`
                : "도면의 시작 위치에서 출발해요."}
            </Type>
          </div>
        </header>
        {minimap && (
          <details className="vr-start-room">
            <summary>시작할 방 바꾸기</summary>
            {minimap}
          </details>
        )}
        <details className="vr-controller-guide">
          <summary>컨트롤러 조작법</summary>
          <dl>
            <dt>왼쪽 스틱</dt>
            <dd>바라보는 방향을 기준으로 걷기</dd>
            <dt>오른쪽 스틱</dt>
            <dd>시점을 좌우로 30° 돌리기</dd>
            <dt>트리거</dt>
            <dd>바닥을 가리켜 이동하거나 문 열고 닫기</dd>
            <dt>가구 편집</dt>
            <dd>
              트리거나 그립을 누른 채 옮기고, 같은 손 스틱으로 15°씩 돌린 뒤
              놓기
            </dd>
          </dl>
        </details>
        <div ref={entryRef} className="vr-entry-slot" />
        <ActionButton variant="ghost" size="small" onClick={onReturn}>
          3D로 돌아가기
        </ActionButton>
      </section>
    </div>
  )
}
