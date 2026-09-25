import type { Furniture, RoomModel } from "@/features/studio/types"
import {
  roomCenter,
  roomForFurniture,
} from "@/features/studio/house-navigation"

export function HouseMap({
  room,
  furniture,
  selectedRoom,
  onEnter,
  compact = false,
}: {
  room: RoomModel
  furniture: Furniture[]
  selectedRoom: number | null
  onEnter: (index: number) => void
  compact?: boolean
}) {
  const padding = 0.4
  const viewBox = `${-padding} ${-padding} ${room.bounds.width + padding * 2} ${room.bounds.depth + padding * 2}`
  return (
    <svg
      className={`house-map ${compact ? "house-map-compact" : ""}`}
      viewBox={viewBox}
      role="img"
      aria-label="방을 선택할 수 있는 집 평면도"
    >
      {room.rooms.map((label, index) => {
        const [cx, cz] = roomCenter(label)
        const count = furniture.filter(
          (item) => roomForFurniture(room.rooms, item) === index
        ).length
        return (
          <g
            key={`${label.name}-${index}`}
            className={`map-room ${selectedRoom === index ? "is-selected" : ""}`}
          >
            <polygon
              points={label.polygon.map(([x, z]) => `${x},${z}`).join(" ")}
              role="button"
              tabIndex={0}
              aria-label={`${label.name} 들어가기, 가구 ${count}개`}
              onClick={() => onEnter(index)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault()
                  onEnter(index)
                }
              }}
            />
            {!compact && (
              <text
                x={cx}
                y={cz}
                textAnchor="middle"
                dominantBaseline="middle"
                pointerEvents="none"
              >
                {label.name}
              </text>
            )}
          </g>
        )
      })}
      {furniture.map((item) => (
        <circle
          key={item.id}
          className="map-furniture"
          cx={item.x}
          cy={item.z}
          r={compact ? 0.1 : 0.08}
          pointerEvents="none"
        />
      ))}
    </svg>
  )
}
