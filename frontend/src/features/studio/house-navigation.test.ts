import { describe, expect, it } from "vite-plus/test"

import { sampleProject } from "./data"
import {
  containsPoint,
  projectTotal,
  roomCenter,
  roomForFurniture,
} from "./house-navigation"

describe("house navigation", () => {
  it("places the sample furniture in its rooms and totals its catalog prices", () => {
    const rooms = sampleProject.room!.rooms
    expect(
      sampleProject.furniture.map(
        (item) => rooms[roomForFurniture(rooms, item)]?.name
      )
    ).toEqual([
      "거실",
      "거실",
      "거실",
      "거실",
      "안방",
      "주방 · 식당",
      "주방 · 식당",
      "방1",
    ])
    expect(projectTotal(sampleProject)).toBe(3_272_000)
  })

  it("chooses an interior point for a room with a recessed corner", () => {
    const room = {
      name: "ㄱ자 방",
      polygon: [
        [0, 0],
        [4, 0],
        [4, 1],
        [1, 1],
        [1, 4],
        [0, 4],
      ] as [number, number][],
    }
    const [x, z] = roomCenter(room)
    expect(containsPoint(room.polygon, x, z)).toBe(true)
  })
})
