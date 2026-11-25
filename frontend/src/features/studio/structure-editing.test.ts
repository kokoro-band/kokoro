import { describe, expect, it } from "vite-plus/test"
import {
  addOpening,
  buildRoomModel,
  normalizeDraft,
  roomPolygon,
  type RoomRect,
} from "./room-builder"
import {
  adjustOpening,
  alongWall,
  resizeStructure,
  type ResizeHandle,
  type StructureState,
} from "./structure-editing"

const room: RoomRect = { id: "a", name: "방", x: 0, z: 0, width: 4, depth: 4 }
const initial = (rooms = [room]): StructureState => ({
  draft: { rooms, wallHeight: 2.4 },
  openings: [],
})
function withOpening(
  state: StructureState,
  type: "door" | "window" = "door",
  center = 2,
  width = 0.9
) {
  const model = buildRoomModel(state.draft, state.openings)
  const top = model.walls.find((wall) => wall.a[1] === 0 && wall.b[1] === 0)!
  return {
    ...state,
    openings: addOpening(model, top.id, type, center, width).openings,
  }
}

describe("room handles", () => {
  it.each([
    ["n", { x: 0, z: 0.8, width: 4, depth: 3.2 }],
    ["ne", { x: 0, z: 0.8, width: 4.8, depth: 3.2 }],
    ["e", { x: 0, z: 0, width: 4.8, depth: 4 }],
    ["se", { x: 0, z: 0, width: 4.8, depth: 4.8 }],
    ["s", { x: 0, z: 0, width: 4, depth: 4.8 }],
    ["sw", { x: 0.8, z: 0, width: 3.2, depth: 4.8 }],
    ["w", { x: 0.8, z: 0, width: 3.2, depth: 4 }],
    ["nw", { x: 0.8, z: 0.8, width: 3.2, depth: 3.2 }],
  ] as [
    ResizeHandle,
    { x: number; z: number; width: number; depth: number },
  ][])("anchors the opposite edges for %s", (handle, expected) => {
    const next = resizeStructure(initial(), "a", handle, 0.84, 0.84).state.draft
      .rooms[0]
    expect(next).toMatchObject(expected)
  })
  it("clamps without flipping and rejects non-finite input", () => {
    const base = initial()
    expect(
      resizeStructure(base, "a", "nw", 200, 200).state.draft.rooms[0]
    ).toMatchObject({
      x: 3,
      z: 3,
      width: 1,
      depth: 1,
    })
    expect(
      resizeStructure(base, "a", "se", 200, 200).state.draft.rooms[0]
    ).toMatchObject({
      width: 40,
      depth: 40,
    })
    expect(resizeStructure(base, "a", "se", NaN, 1).state).toBe(base)
    expect(resizeStructure(base, "a", "se", 0.01, 0.01).state).toBe(base)
  })
  it("keeps other rooms still and normalizes only at commit", () => {
    const state = initial([room, { ...room, id: "b", x: 4 }])
    const next = resizeStructure(state, "a", "w", -1, 0).state
    expect(next.draft.rooms[0].x).toBe(-1)
    expect(next.draft.rooms[1]).toEqual(state.draft.rooms[1])
    expect(normalizeDraft(next.draft).rooms[1].x).toBe(5)
  })
})

describe("opening adjustments", () => {
  it("applies exact numeric edits independently of drag snapping", () => {
    const state = withOpening(initial(), "door", 2, 0.9)
    const model = buildRoomModel(state.draft, state.openings)
    expect(model.openings[0].from).toBe(1.55)
    const next = adjustOpening(
      model,
      model.openings[0].id,
      "move",
      1.6 - 1.55,
      false
    )
    expect(next[0]).toMatchObject({ from: 1.6, to: 2.5 })
    const clamped = adjustOpening(model, model.openings[0].id, "move", -100)
    const expanded = adjustOpening(
      { ...model, openings: clamped },
      clamped[0].id,
      "to",
      0.35,
      false
    )
    expect(expanded[0]).toMatchObject({ from: 0, to: 1.25 })
  })
  it.each(["door", "window"] as const)(
    "selection alone never snaps a default %s",
    (type) => {
      const state = withOpening(initial(), type, 2, type === "door" ? 0.9 : 1.5)
      const model = buildRoomModel(state.draft, state.openings)
      for (const handle of ["move", "from", "to"] as const) {
        expect(adjustOpening(model, model.openings[0].id, handle, 0)).toBe(
          model.openings
        )
        expect(adjustOpening(model, model.openings[0].id, handle, 0.01)).toBe(
          model.openings
        )
      }
    }
  )
  it.each(["door", "window"] as const)(
    "moves and resizes a %s without leaving the wall",
    (type) => {
      const state = withOpening(initial(), type, 1, 1)
      const model = buildRoomModel(state.draft, state.openings)
      const id = model.openings[0].id
      expect(adjustOpening(model, id, "move", -100)[0]).toMatchObject({
        from: 0,
        to: 1,
      })
      expect(adjustOpening(model, id, "move", 100)[0]).toMatchObject({
        from: 3,
        to: 4,
      })
      expect(adjustOpening(model, id, "from", 100)[0]).toMatchObject({
        from: 1.2,
        to: 1.5,
      })
      expect(adjustOpening(model, id, "to", -100)[0]).toMatchObject({
        from: 0.5,
        to: 0.8,
      })
      expect(adjustOpening(model, id, "move", NaN)).toBe(model.openings)
      expect(adjustOpening(model, id, "move", 0)).toBe(model.openings)
    }
  )
  it("cannot move through or resize across another opening", () => {
    const state = withOpening(
      withOpening(initial(), "door", 1, 1),
      "window",
      3,
      1
    )
    const model = buildRoomModel(state.draft, state.openings)
    const id = model.openings[0].id
    expect(adjustOpening(model, id, "move", 100)[0]).toMatchObject({
      from: 1.5,
      to: 2.5,
    })
    expect(adjustOpening(model, id, "to", 100)[0].to).toBe(2.5)
    expect(
      adjustOpening(model, model.openings[1].id, "from", -100)[1].from
    ).toBe(1.5)
  })
  it("projects both horizontal and reversed vertical walls", () => {
    expect(
      alongWall({ id: "w", a: [2, 4], b: [2, 0], thickness: 0.2 }, [3, 3])
    ).toBe(1)
    expect(
      alongWall({ id: "w", a: [4, 0], b: [0, 0], thickness: 0.2 }, [3, 3])
    ).toBe(1)
  })
})

describe("opening preservation during room resize", () => {
  it.each(["n", "ne", "e", "se", "s", "sw", "w", "nw"] as ResizeHandle[])(
    "preserves identity and physical width for %s",
    (handle) => {
      const state = withOpening(initial())
      const result = resizeStructure(state, "a", handle, -0.5, -0.5)
      expect(result.error).toBeUndefined()
      const model = buildRoomModel(result.state.draft, result.state.openings)
      expect(model.openings).toHaveLength(1)
      expect(model.openings[0].id).toBe(state.openings[0].id)
      expect(model.openings[0].to - model.openings[0].from).toBeCloseTo(0.9)
    }
  )
  it("preserves openings on both portions of a merged exterior wall", () => {
    const state = withOpening(
      withOpening(initial([room, { ...room, id: "b", x: 4 }]), "door", 1, 1),
      "window",
      6,
      1
    )
    const result = resizeStructure(state, "a", "w", -2, 0)
    expect(result.error).toBeUndefined()
    const [first, second] = result.state.openings
    expect(first).toMatchObject({ from: 1, to: 2 })
    // New origin is -2. The stationary room's opening stays at x=6 in world space.
    expect(second).toMatchObject({ from: 7.5, to: 8.5 })
  })
  it("preserves notch-edge openings with the actual changed polygon", () => {
    const state = initial([
      { ...room, notch: { corner: "ne", width: 1, depth: 1 } },
    ])
    const model = buildRoomModel(state.draft)
    const inner = model.walls.find(
      (wall) => wall.a[0] === 3 && wall.b[0] === 3
    )!
    state.openings = addOpening(model, inner.id, "window", 0.5, 0.4).openings
    const result = resizeStructure(state, "a", "e", 1, 0)
    expect(result.error).toBeUndefined()
    expect(roomPolygon(result.state.draft.rooms[0])).toContainEqual([4, 1])
    const next = buildRoomModel(result.state.draft, result.state.openings)
    const wall = next.walls.find((item) => item.id === next.openings[0].wallId)!
    expect(wall.a[0]).toBe(4)
    expect(next.openings[0].to - next.openings[0].from).toBeCloseTo(0.4)
  })
  it("refuses to lose or overlap openings when a wall becomes too short", () => {
    const state = withOpening(initial(), "window", 2, 2)
    const result = resizeStructure(state, "a", "e", -3, 0)
    expect(result.error).toBeTruthy()
    expect(result.state).toBe(state)
    const pair = withOpening(
      withOpening(initial(), "door", 1, 1),
      "window",
      3,
      1
    )
    expect(resizeStructure(pair, "a", "e", -3, 0).error).toBeTruthy()
  })
})
