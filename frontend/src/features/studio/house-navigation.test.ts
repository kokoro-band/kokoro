import { describe, expect, it } from "vite-plus/test"

import { sampleProject } from "./data"
import {
  canPlaceFurniture,
  containsPoint,
  nearestPlacement,
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

describe("canPlaceFurniture", () => {
  const rooms = sampleProject.room!.rooms
  const livingRoom = rooms.find((room) => room.name === "거실")!
  const [x, z] = roomCenter(livingRoom)

  it("allows a spot inside the focused room", () => {
    expect(canPlaceFurniture(sampleProject, livingRoom, x, z)).toBe(true)
    expect(canPlaceFurniture(sampleProject, null, x, z)).toBe(true)
  })

  it("rejects spots outside the house or the focused room", () => {
    expect(canPlaceFurniture(sampleProject, null, -1, z)).toBe(false)
    const other = rooms.find((room) => room !== livingRoom)!
    const [otherX, otherZ] = roomCenter(other)
    expect(canPlaceFurniture(sampleProject, livingRoom, otherX, otherZ)).toBe(
      false
    )
    expect(canPlaceFurniture(sampleProject, null, otherX, otherZ)).toBe(true)
  })
})

describe("nearestPlacement", () => {
  const livingRoom = sampleProject.room!.rooms.find(
    (room) => room.name === "거실"
  )!
  const current = { x: 4.5, z: 4 }

  it("keeps a typed spot that is already inside the room", () => {
    expect(
      nearestPlacement(sampleProject, livingRoom, current, { x: 5, z: 4 })
    ).toEqual({ x: 5, z: 4 })
  })

  it("pulls a typed spot outside the room back to its nearest edge", () => {
    const placed = nearestPlacement(sampleProject, livingRoom, current, {
      x: 3,
      z: 4,
    })
    expect(placed).toEqual({ x: 3.2, z: 4 })
    expect(
      canPlaceFurniture(sampleProject, livingRoom, placed.x, placed.z)
    ).toBe(true)
  })
})
