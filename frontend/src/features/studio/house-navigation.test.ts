import { describe, expect, it } from "vite-plus/test"

import { sampleProject } from "./data"
import {
  containsPoint,
  projectTotal,
  roomCenter,
  roomForFurniture,
} from "./house-navigation"

describe("house navigation", () => {
  it("places the sample furniture in the living room and totals its catalog prices", () => {
    const rooms = sampleProject.room!.rooms
    const livingRoom = rooms.findIndex((room) => room.name === "거실")
    expect(
      sampleProject.furniture.map((item) => roomForFurniture(rooms, item))
    ).toEqual([livingRoom, livingRoom, livingRoom, livingRoom])
    expect(projectTotal(sampleProject)).toBe(1_463_000)
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
