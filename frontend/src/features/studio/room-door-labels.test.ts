import { describe, expect, it } from "vite-plus/test"
import { sampleRoom } from "./sample-room"
import { doorLocation, doorMenuLabels } from "./room-door-labels"
import type { RoomModel } from "./types"

describe("door menu locations", () => {
  it("names rooms on both sides of an interior door", () => {
    const door = sampleRoom.openings.find(
      (opening) => opening.id === "door-entry-living"
    )!
    expect(doorLocation(sampleRoom, door)).toBe("거실 ↔ 현관")
  })

  it("names the room beside an exterior door", () => {
    const door = sampleRoom.openings.find(
      (opening) => opening.id === "door-front"
    )!
    expect(doorLocation(sampleRoom, door)).toBe("현관 출입문")
  })

  it("distinguishes nearby doors by their position on the plan", () => {
    const room: RoomModel = {
      version: 2,
      unit: "m",
      wallHeight: 2.4,
      bounds: { width: 6, depth: 6 },
      outline: [
        [0, 0],
        [6, 0],
        [6, 6],
        [0, 6],
      ],
      walls: [{ id: "divider", a: [3, 0], b: [3, 6], thickness: 0.1 }],
      rooms: [
        {
          name: "거실",
          polygon: [
            [0, 0],
            [3, 0],
            [3, 6],
            [0, 6],
          ],
        },
        {
          name: "복도",
          polygon: [
            [3, 0],
            [6, 0],
            [6, 6],
            [3, 6],
          ],
        },
      ],
      openings: [
        {
          id: "upper",
          wallId: "divider",
          type: "door",
          from: 1,
          to: 2,
          bottom: 0,
          top: 2,
        },
        {
          id: "lower",
          wallId: "divider",
          type: "door",
          from: 4,
          to: 5,
          bottom: 0,
          top: 2,
        },
      ],
    }
    const labels = doorMenuLabels(room)
    expect(labels.get("upper")).toBe("거실 ↔ 복도 · 위쪽")
    expect(labels.get("lower")).toBe("거실 ↔ 복도 · 아래쪽")

    room.walls[0] = { id: "divider", a: [0, 3], b: [6, 3], thickness: 0.1 }
    room.rooms = [
      {
        name: "위",
        polygon: [
          [0, 0],
          [6, 0],
          [6, 3],
          [0, 3],
        ],
      },
      {
        name: "아래",
        polygon: [
          [0, 3],
          [6, 3],
          [6, 6],
          [0, 6],
        ],
      },
    ]
    const horizontal = doorMenuLabels(room)
    expect(horizontal.get("upper")).toBe("아래 ↔ 위 · 왼쪽")
    expect(horizontal.get("lower")).toBe("아래 ↔ 위 · 오른쪽")
  })
})
