import { containsPoint } from "./house-navigation"
import type { Opening, RoomModel } from "./types"

function doorPosition(room: RoomModel, opening: Opening) {
  const wall = room.walls.find((item) => item.id === opening.wallId)
  if (!wall) return null
  const dx = wall.b[0] - wall.a[0]
  const dz = wall.b[1] - wall.a[1]
  const length = Math.hypot(dx, dz)
  if (!length) return null
  const along = (opening.from + opening.to) / 2
  return {
    x: wall.a[0] + (dx / length) * along,
    z: wall.a[1] + (dz / length) * along,
    normalX: -dz / length,
    normalZ: dx / length,
    offset: wall.thickness / 2 + 0.15,
  }
}

/** Name the spaces on either side of a doorway for the keyboard door menu. */
export function doorLocation(room: RoomModel, opening: Opening) {
  const position = doorPosition(room, opening)
  if (!position) return "위치를 알 수 없는 문"
  const { x, z, normalX, normalZ, offset } = position
  const sides = [-1, 1].map(
    (side) =>
      room.rooms.find((label) =>
        containsPoint(
          label.polygon,
          x + normalX * offset * side,
          z + normalZ * offset * side
        )
      )?.name
  )

  if (sides[0] && sides[1] && sides[0] !== sides[1])
    return [sides[0], sides[1]]
      .sort((a, b) => a.localeCompare(b, "ko"))
      .join(" ↔ ")
  const inside = sides[0] ?? sides[1]
  if (inside) return `${inside} 출입문`
  return `가로 ${x.toFixed(1)}m · 세로 ${z.toFixed(1)}m의 문`
}

/** Add a plan-relative qualifier only when two doors have the same room names. */
export function doorMenuLabels(room: RoomModel) {
  const groups = new Map<string, { id: string; x: number; z: number }[]>()
  for (const door of room.openings) {
    if (door.type !== "door") continue
    const name = doorLocation(room, door)
    const position = doorPosition(room, door)
    const group = groups.get(name) ?? []
    group.push({ id: door.id, x: position?.x ?? 0, z: position?.z ?? 0 })
    groups.set(name, group)
  }

  const labels = new Map<string, string>()
  for (const [name, group] of groups) {
    if (group.length === 1) {
      labels.set(group[0].id, name)
      continue
    }
    const xSpread =
      Math.max(...group.map((door) => door.x)) -
      Math.min(...group.map((door) => door.x))
    const zSpread =
      Math.max(...group.map((door) => door.z)) -
      Math.min(...group.map((door) => door.z))
    const horizontal = xSpread >= zSpread
    const ordered = [...group].sort((a, b) =>
      horizontal ? a.x - b.x || a.z - b.z : a.z - b.z || a.x - b.x
    )
    ordered.forEach((door, index) => {
      const qualifier =
        ordered.length > 3
          ? horizontal
            ? `가로 ${door.x.toFixed(2)}m`
            : `세로 ${door.z.toFixed(2)}m`
          : horizontal
            ? ["왼쪽", ...(ordered.length === 3 ? ["가운데"] : []), "오른쪽"][
                index
              ]
            : ["위쪽", ...(ordered.length === 3 ? ["가운데"] : []), "아래쪽"][
                index
              ]
      labels.set(door.id, `${name} · ${qualifier}`)
    })
  }
  return labels
}
