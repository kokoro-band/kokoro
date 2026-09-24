import { describe, expect, it } from "vite-plus/test"

import {
  addOpening,
  addRoom,
  buildRoomModel,
  createDraft,
  draftAreaPyeong,
  draftFromModel,
  hasOverlap,
  exteriorThickness,
  isConnected,
  interiorThickness,
  labelPoint,
  moveRoom,
  nextRoomName,
  removeOpening,
  removeRoom,
  resizeRoom,
  roomPolygon,
  setNotch,
  splitRoom,
  splitSpan,
  type RoomDraft,
} from "./room-builder"

function draftOf(
  rooms: {
    id: string
    name: string
    x: number
    z: number
    width: number
    depth: number
  }[]
): RoomDraft {
  return { rooms, wallHeight: 2.4 }
}

describe("area", () => {
  it("reports the area of the current rooms in pyeong", () => {
    const draft = draftOf([
      { id: "a", name: "거실", x: 0, z: 0, width: 4, depth: 3 },
      { id: "b", name: "방", x: 4, z: 0, width: 3, depth: 3 },
    ])

    expect(draftAreaPyeong(draft)).toBeCloseTo(21 / 3.3058, 1)
  })
})

describe("createDraft", () => {
  it("sizes the first room from the given area", () => {
    const draft = createDraft(20)
    const room = draft.rooms[0]

    expect(room.width * room.depth).toBeCloseTo(20 * 3.3058, 0)
    expect(room.width).toBeGreaterThan(room.depth)
    expect(draft.source).toEqual({
      areaPyeong: 20,
      roomCount: 1,
      preset: "blocks-v1",
    })
  })
})

describe("buildRoomModel", () => {
  it("builds four exterior walls for a single room", () => {
    const model = buildRoomModel(
      draftOf([{ id: "a", name: "거실", x: 0, z: 0, width: 4, depth: 3 }])
    )

    expect(model.bounds).toEqual({ width: 4, depth: 3 })
    expect(model.outline).toHaveLength(4)
    expect(model.walls).toHaveLength(4)
    expect(
      model.walls.every((wall) => wall.thickness === exteriorThickness)
    ).toBe(true)
  })

  it("shares one interior wall between two touching rooms", () => {
    const model = buildRoomModel(
      draftOf([
        { id: "a", name: "거실", x: 0, z: 0, width: 4, depth: 3 },
        { id: "b", name: "안방", x: 4, z: 0, width: 3, depth: 3 },
      ])
    )

    const interior = model.walls.filter(
      (wall) => wall.thickness === interiorThickness
    )
    expect(interior).toHaveLength(1)
    expect(interior[0].a).toEqual([4, 0])
    expect(interior[0].b).toEqual([4, 3])
    expect(model.bounds).toEqual({ width: 7, depth: 3 })
    expect(model.outline).toHaveLength(4)
  })

  it("produces an L shaped outline for offset rooms", () => {
    const model = buildRoomModel(
      draftOf([
        { id: "a", name: "거실", x: 0, z: 0, width: 4, depth: 4 },
        { id: "b", name: "방", x: 4, z: 0, width: 3, depth: 2 },
      ])
    )

    expect(model.bounds).toEqual({ width: 7, depth: 4 })
    expect(model.outline).toHaveLength(6)
    expect(model.outline).toContainEqual([7, 2])
    expect(model.outline).toContainEqual([4, 2])
  })

  it("normalizes negative coordinates to the origin", () => {
    const model = buildRoomModel(
      draftOf([{ id: "a", name: "거실", x: -2, z: -1, width: 3, depth: 3 }])
    )

    expect(model.outline).toContainEqual([0, 0])
    expect(model.bounds).toEqual({ width: 3, depth: 3 })
  })

  it("keeps room labels and spawns inside the first room", () => {
    const model = buildRoomModel(
      draftOf([
        { id: "a", name: "거실", x: 0, z: 0, width: 4, depth: 3 },
        { id: "b", name: "안방", x: 4, z: 0, width: 3, depth: 3 },
      ])
    )

    expect(model.rooms.map((room) => room.name)).toEqual(["거실", "안방"])
    expect(model.spawn).toEqual([2, 1.5])
  })
})

describe("editing", () => {
  it("snaps a moved room to a neighbouring wall", () => {
    const draft = addRoom(createDraft(20), "안방", 3, 3)
    const target = draft.rooms[1]
    const moved = moveRoom(draft, target.id, target.x + 0.2, 0)

    expect(moved.rooms[1].x).toBe(target.x)
  })

  it("leaves a room where it is when no wall is near", () => {
    const draft = addRoom(createDraft(20), "안방", 3, 3)
    const target = draft.rooms[1]
    const moved = moveRoom(draft, target.id, target.x, target.z + 2)

    expect(moved.rooms[1].z).toBe(target.z + 2)
  })

  it("tracks the room count in source", () => {
    const draft = addRoom(createDraft(20), "안방")
    expect(draft.source?.roomCount).toBe(2)
    expect(removeRoom(draft, "room-2").source?.roomCount).toBe(1)
  })

  it("moves the rooms behind the resized edge so no gap appears", () => {
    const draft = resizeRoom(
      draftOf([
        { id: "a", name: "거실", x: 0, z: 0, width: 4, depth: 3 },
        { id: "b", name: "방", x: 4, z: 0, width: 3, depth: 3 },
      ]),
      "a",
      3,
      3
    )

    expect(draft.rooms[1].x).toBe(3)
    expect(buildRoomModel(draft).bounds).toEqual({ width: 6, depth: 3 })
    expect(buildRoomModel(draft).outline).toHaveLength(4)
  })

  it("keeps a minimum room size when resizing", () => {
    const draft = resizeRoom(createDraft(20), "room-1", 0.2, 0.2)
    expect(draft.rooms[0].width).toBe(1)
    expect(draft.rooms[0].depth).toBe(1)
  })
})

describe("L shaped rooms", () => {
  const draft = setNotch(
    draftOf([{ id: "a", name: "거실", x: 0, z: 0, width: 6, depth: 4 }]),
    "a",
    { corner: "ne", width: 2, depth: 1.5 }
  )

  it("cuts the chosen corner out of the room", () => {
    const model = buildRoomModel(draft)

    expect(model.outline).toHaveLength(6)
    expect(model.outline).toContainEqual([4, 0])
    expect(model.outline).toContainEqual([4, 1.5])
    expect(model.outline).toContainEqual([6, 1.5])
    expect(model.rooms[0].polygon).toHaveLength(6)
  })

  it("keeps the notch within the room when it is dragged too far", () => {
    const wide = setNotch(draft, "a", { corner: "ne", width: 99, depth: 99 })

    expect(wide.rooms[0].notch).toEqual({
      corner: "ne",
      width: 5.5,
      depth: 3.5,
    })
  })

  it("restores the notch when the model is edited again", () => {
    const model = buildRoomModel(draft)
    const restored = draftFromModel(model)

    expect(restored.rooms[0].notch).toEqual({
      corner: "ne",
      width: 2,
      depth: 1.5,
    })
  })
})

describe("layout integrity", () => {
  it("keeps blocks and walls on the same origin after moving left", () => {
    const draft = moveRoom(
      draftOf([
        { id: "a", name: "거실", x: 4, z: 2, width: 4, depth: 3 },
        { id: "b", name: "방", x: 8, z: 2, width: 3, depth: 3 },
      ]),
      "a",
      -2,
      -1
    )
    const model = buildRoomModel(draft)

    expect(Math.min(...draft.rooms.map((room) => room.x))).toBe(0)
    expect(Math.min(...draft.rooms.map((room) => room.z))).toBe(0)
    expect(model.outline).toContainEqual([0, 0])
  })

  it("normalizes coordinates after a room is removed", () => {
    const draft = removeRoom(
      draftOf([
        { id: "a", name: "거실", x: 0, z: 0, width: 4, depth: 3 },
        { id: "b", name: "방", x: 4, z: 0, width: 3, depth: 3 },
      ]),
      "a"
    )

    expect(draft.rooms[0].x).toBe(0)
    expect(buildRoomModel(draft).bounds).toEqual({ width: 3, depth: 3 })
  })

  it("keeps a dragged room next to the rest of the layout", () => {
    const draft = moveRoom(
      draftOf([
        { id: "a", name: "거실", x: 0, z: 0, width: 4, depth: 3 },
        { id: "b", name: "방", x: 4, z: 0, width: 3, depth: 3 },
      ]),
      "b",
      40,
      40
    )
    const moved = draft.rooms.find((room) => room.name === "방")!
    const other = draft.rooms.find((room) => room.name === "거실")!

    expect(moved.x).toBeLessThanOrEqual(other.x + other.width)
    expect(moved.z).toBeLessThanOrEqual(other.z + other.depth)
  })

  it("detects rooms that are not touching", () => {
    const joined = draftOf([
      { id: "a", name: "거실", x: 0, z: 0, width: 4, depth: 3 },
      { id: "b", name: "방", x: 4, z: 0, width: 3, depth: 3 },
    ])
    const split = draftOf([
      { id: "a", name: "거실", x: 0, z: 0, width: 4, depth: 3 },
      { id: "b", name: "방", x: 8, z: 0, width: 3, depth: 3 },
    ])

    expect(isConnected(joined)).toBe(true)
    expect(isConnected(split)).toBe(false)
  })

  it("uses the largest loop when rooms are detached", () => {
    const model = buildRoomModel(
      draftOf([
        { id: "a", name: "거실", x: 0, z: 0, width: 6, depth: 4 },
        { id: "b", name: "방", x: 9, z: 0, width: 2, depth: 2 },
      ])
    )

    expect(model.outline).toHaveLength(4)
    expect(model.outline).toContainEqual([6, 4])
  })
})

describe("openings", () => {
  const model = buildRoomModel(
    draftOf([
      { id: "a", name: "거실", x: 0, z: 0, width: 4, depth: 3 },
      { id: "b", name: "안방", x: 4, z: 0, width: 3, depth: 3 },
    ])
  )
  const interiorWall = model.walls.find(
    (wall) => wall.thickness === interiorThickness
  )!

  it("adds a door centred on the wall", () => {
    const next = addOpening(model, interiorWall.id, "door", 1.5)

    expect(next.openings).toHaveLength(1)
    expect(next.openings[0]).toMatchObject({
      wallId: interiorWall.id,
      type: "door",
      from: 1.05,
      to: 1.95,
      bottom: 0,
    })
  })

  it("keeps an opening inside the wall when it is placed near the end", () => {
    const next = addOpening(model, interiorWall.id, "door", 3.5)

    expect(next.openings[0].to).toBeLessThanOrEqual(3)
    expect(next.openings[0].from).toBeGreaterThanOrEqual(0)
  })

  it("ignores an opening that overlaps another one", () => {
    const withDoor = addOpening(model, interiorWall.id, "door", 1.5)
    const next = addOpening(withDoor, interiorWall.id, "window", 1.6)

    expect(next.openings).toHaveLength(1)
  })

  it("keeps an opening when the wall stays in place", () => {
    const withDoor = addOpening(model, interiorWall.id, "door", 1.5)
    const rebuilt = buildRoomModel(
      draftOf([{ id: "a", name: "거실", x: 0, z: 0, width: 4, depth: 3 }]),
      withDoor.openings
    )

    expect(rebuilt.openings).toHaveLength(1)
  })

  it("drops openings whose wall disappeared after editing", () => {
    const withDoor = addOpening(model, interiorWall.id, "door", 1.5)
    const rebuilt = buildRoomModel(
      draftOf([{ id: "a", name: "거실", x: 0, z: 0, width: 5, depth: 3 }]),
      withDoor.openings
    )

    expect(rebuilt.openings).toHaveLength(0)
  })
})

describe("splitRoom", () => {
  const base = draftOf([
    { id: "room-1", name: "거실", x: 0, z: 0, width: 6, depth: 4 },
  ])

  it("splits one room into two without changing the total area", () => {
    const draft = splitRoom(base, "room-1", "vertical", 4, "안방")

    expect(draft.rooms).toHaveLength(2)
    expect(draft.rooms[0]).toMatchObject({ x: 0, z: 0, width: 4, depth: 4 })
    expect(draft.rooms[1]).toMatchObject({
      name: "안방",
      x: 4,
      z: 0,
      width: 2,
      depth: 4,
    })
    expect(draftAreaPyeong(draft)).toBe(draftAreaPyeong(base))
  })

  it("splits along the other axis", () => {
    const draft = splitRoom(base, "room-1", "horizontal", 1.5)

    expect(draft.rooms[0]).toMatchObject({ z: 0, depth: 1.5 })
    expect(draft.rooms[1]).toMatchObject({ z: 1.5, depth: 2.5 })
  })

  it("builds a shared interior wall for the two halves", () => {
    const model = buildRoomModel(splitRoom(base, "room-1", "vertical", 4))
    const interior = model.walls.filter(
      (wall) => wall.thickness === interiorThickness
    )

    expect(interior).toHaveLength(1)
    expect(interior[0].a).toEqual([4, 0])
    expect(interior[0].b).toEqual([4, 4])
    expect(model.bounds).toEqual({ width: 6, depth: 4 })
    expect(model.outline).toHaveLength(4)
  })

  it("ignores a cut that would leave a room under the minimum size", () => {
    expect(splitRoom(base, "room-1", "vertical", 0.5)).toBe(base)
    expect(splitRoom(base, "room-1", "vertical", 5.6)).toBe(base)
  })

  it("gives the new room an unused id", () => {
    const draft = splitRoom(
      splitRoom(base, "room-1", "vertical", 2),
      "room-2",
      "vertical",
      4
    )
    const ids = draft.rooms.map((room) => room.id)

    expect(new Set(ids).size).toBe(ids.length)
  })

  it("keeps a corner notch on the half that holds it", () => {
    const notched = setNotch(base, "room-1", {
      corner: "ne",
      width: 1,
      depth: 1,
    })
    const draft = splitRoom(notched, "room-1", "vertical", 3)

    expect(draft.rooms[0].notch).toBeUndefined()
    expect(draft.rooms[1].notch).toEqual({ corner: "ne", width: 1, depth: 1 })
  })

  it("carves both halves when the notch straddles the cut", () => {
    const notched = setNotch(base, "room-1", {
      corner: "sw",
      width: 4,
      depth: 2,
    })
    const draft = splitRoom(notched, "room-1", "vertical", 3)

    expect(draft.rooms[0]).toMatchObject({ x: 0, z: 0, width: 3, depth: 2 })
    expect(draft.rooms[0].notch).toBeUndefined()
    expect(draft.rooms[1].notch).toEqual({ corner: "sw", width: 1, depth: 2 })
    expect(draftAreaPyeong(draft)).toBe(draftAreaPyeong(notched))
  })

  it("turns a fully notched half into a smaller rectangle", () => {
    const notched = setNotch(base, "room-1", {
      corner: "nw",
      width: 4,
      depth: 1.5,
    })
    const draft = splitRoom(notched, "room-1", "vertical", 2)

    expect(draft.rooms[0]).toMatchObject({
      x: 0,
      z: 1.5,
      width: 2,
      depth: 2.5,
    })
    expect(draft.rooms[0].notch).toBeUndefined()
    expect(draft.rooms[1].notch).toEqual({ corner: "nw", width: 2, depth: 1.5 })
    expect(buildRoomModel(draft).outline).toHaveLength(6)
  })

  it("refuses a cut that would leave a sliver next to the notch", () => {
    const notched = setNotch(base, "room-1", {
      corner: "nw",
      width: 4,
      depth: 3.5,
    })

    expect(splitRoom(notched, "room-1", "vertical", 2)).toBe(notched)
  })

  it("tracks the room count in source", () => {
    const draft = splitRoom(createDraft(20), "room-1", "vertical", 3)
    expect(draft.source?.roomCount).toBe(2)
  })
})

describe("splitSpan", () => {
  const room = { id: "a", name: "거실", x: 0, z: 0, width: 6, depth: 4 }

  it("spans the whole room when there is no notch", () => {
    expect(splitSpan(room, "vertical", 3)).toEqual([0, 4])
    expect(splitSpan(room, "horizontal", 2)).toEqual([0, 6])
  })

  it("stops at the notch when the cut runs through it", () => {
    const notched = {
      ...room,
      notch: { corner: "sw" as const, width: 4, depth: 1.5 },
    }

    expect(splitSpan(notched, "vertical", 3)).toEqual([0, 2.5])
    expect(splitSpan(notched, "vertical", 5)).toEqual([0, 4])
  })

  it("starts after the notch when it is cut from the top", () => {
    const notched = {
      ...room,
      notch: { corner: "ne" as const, width: 4, depth: 1.5 },
    }

    expect(splitSpan(notched, "vertical", 3)).toEqual([1.5, 4])
  })
})

describe("labelPoint", () => {
  it("uses the middle of a plain room", () => {
    expect(
      labelPoint(
        roomPolygon({ id: "a", name: "방", x: 0, z: 0, width: 4, depth: 3 })
      )
    ).toEqual([2, 1.5])
  })

  it("stays inside the shape of an L shaped room", () => {
    const polygon = roomPolygon({
      id: "a",
      name: "방",
      x: 0,
      z: 0,
      width: 6,
      depth: 4,
      notch: { corner: "ne", width: 4, depth: 3 },
    })
    const [x, z] = labelPoint(polygon)

    expect(x).toBeLessThan(2)
    expect(z).toBeLessThan(3)
  })
})

describe("guards", () => {
  const twoRooms = draftOf([
    { id: "a", name: "거실", x: 0, z: 0, width: 4, depth: 3 },
    { id: "b", name: "방 1", x: 4, z: 0, width: 3, depth: 3 },
  ])

  it("ignores a move that changes nothing", () => {
    const target = twoRooms.rooms[1]
    expect(moveRoom(twoRooms, "b", target.x, target.z)).toBe(twoRooms)
  })

  it("ignores edits with values that are not numbers", () => {
    expect(moveRoom(twoRooms, "b", Number.NaN, 0)).toBe(twoRooms)
    expect(splitRoom(twoRooms, "a", "vertical", Number.NaN)).toBe(twoRooms)
    expect(
      resizeRoom(twoRooms, "a", Number.NaN, Number.NaN).rooms[0]
    ).toMatchObject({
      width: 4,
      depth: 3,
    })
  })

  it("keeps the area of a new draft within the supported range", () => {
    expect(draftAreaPyeong(createDraft(1000))).toBeCloseTo(100, 0)
    expect(draftAreaPyeong(createDraft(Number.NaN))).toBeCloseTo(20, 0)
  })

  it("detects rooms stacked on top of each other", () => {
    expect(hasOverlap(twoRooms)).toBe(false)
    expect(hasOverlap(moveRoom(twoRooms, "b", 2, 0))).toBe(true)
  })

  it("allows a room tucked into the notch of another one", () => {
    const draft = draftOf([
      { id: "a", name: "거실", x: 0, z: 0, width: 6, depth: 4 },
      { id: "b", name: "방 1", x: 4, z: 0, width: 2, depth: 2 },
    ])
    draft.rooms[0].notch = { corner: "ne", width: 2, depth: 2 }

    expect(hasOverlap(draft)).toBe(false)
  })

  it("gives every room a name of its own", () => {
    const named = { ...twoRooms, rooms: [...twoRooms.rooms] }
    expect(nextRoomName(named)).toBe("방 2")
  })

  it("keeps opening ids unique after one is removed", () => {
    const model = buildRoomModel(twoRooms)
    const wall = model.walls.find(
      (item) => item.thickness === interiorThickness
    )!
    const withTwo = addOpening(
      addOpening(model, wall.id, "door", 0.6),
      wall.id,
      "door",
      2.4
    )
    const dropped = removeOpening(withTwo, withTwo.openings[0].id)
    const again = addOpening(dropped, wall.id, "door", 0.6)
    const ids = again.openings.map((item) => item.id)

    expect(again.openings).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
  })

  it("spawns inside an L shaped first room", () => {
    const model = buildRoomModel(
      setNotch(
        draftOf([{ id: "a", name: "거실", x: 0, z: 0, width: 6, depth: 4 }]),
        "a",
        { corner: "ne", width: 4, depth: 3 }
      )
    )

    expect(model.spawn).toEqual(labelPoint(model.rooms[0].polygon))
    expect(model.spawn![0]).toBeLessThan(2)
  })
})
