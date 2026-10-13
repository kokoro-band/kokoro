import { describe, expect, it } from "vite-plus/test"
import { sampleProject } from "./data"
import {
  constrainFurniturePose,
  findFreePlacement,
  findFurniturePlacement,
  turnBlocker,
} from "./furniture-motion"
import {
  footprint,
  insideRoom,
  overlaps,
  placementIssues,
  wallBox,
} from "./placement-issues"
import { buildRoomModel } from "./room-builder"
import type { Furniture, Project, RoomModel, Wall } from "./types"

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
  walls: [
    { id: "west", a: [0, 0], b: [0, 6], thickness: 0.2 },
    { id: "north", a: [0, 0], b: [6, 0], thickness: 0.2 },
  ],
  openings: [],
  rooms: [],
}
const chair = (x: number, z: number): Furniture => ({
  id: "chair",
  catalogId: "chair-shell",
  name: "의자",
  category: "의자",
  x,
  z,
  rotation: 0,
  color: "#000000",
})
const project = (model = room): Project => ({
  ...sampleProject,
  room: model,
  furniture: [],
})
function expectSafe(item: Furniture, model = room) {
  const box = footprint(item)!
  expect(insideRoom(model.outline, box)).toBe(true)
  expect(model.walls.some((wall) => overlaps(box, wallBox(wall)))).toBe(false)
}

describe("wall-safe furniture editing", () => {
  it("stops the full footprint at the wall face and snaps the last 10cm", () => {
    for (const x of [-10, 0.47]) {
      const moved = constrainFurniturePose(project(), chair(2, 2), { x })
      expect(moved.x).toBeCloseTo(0.425, 5)
      expectSafe(moved)
    }
    const exact = constrainFurniturePose(
      project(),
      chair(2, 2),
      { x: -10 },
      undefined,
      false
    )
    expect(exact.x).toBeCloseTo(0.425, 5)
    expectSafe(exact)
  })
  it.each([
    ["numeric", 2, 0.47],
    ["arrow", 0.6, 0.5],
  ] as const)(
    "preserves an exact %s edit near the wall without attraction",
    (_, from, x) => {
      const moved = constrainFurniturePose(
        project(),
        chair(from, 2),
        { x },
        undefined,
        false
      )
      expect(moved.x).toBe(x)
      expectSafe(moved)
    }
  )
  it("uses the rotated width and depth rather than a fixed center margin", () => {
    const sofa = { ...chair(2, 2), catalogId: "sofa-cloud", rotation: 45 }
    const moved = constrainFurniturePose(project(), sofa, { x: -5 })
    expect(moved.x).toBeCloseTo(0.1 + (1.1 + 0.46) / Math.sqrt(2), 5)
    expectSafe(moved)
  })
  it("moves across internal walls and warns only when the final footprint overlaps", () => {
    const model = {
      ...room,
      walls: [
        ...room.walls,
        {
          id: "divider",
          a: [3, 0] as [number, number],
          b: [3, 6] as [number, number],
          thickness: 0.01,
        },
      ],
    }
    const moved = constrainFurniturePose(project(model), chair(1, 2), { x: 5 })
    expect(moved.x).toBe(5)
    const overlapping = constrainFurniturePose(project(model), moved, { x: 3 })
    expect(overlapping.x).toBe(3)
    expect(
      placementIssues({ ...project(model), furniture: [overlapping] })[0].reason
    ).toContain("벽")
    expect(
      constrainFurniturePose(project(model), overlapping, { x: 1 }).x
    ).toBe(1)
    expectSafe(moved, model)
  })
  it("moves through internal doors, solid wall sections and windows", () => {
    const wall: Wall = { id: "inner", a: [3, 0], b: [3, 6], thickness: 0.2 }
    const opening = { id: "gap", wallId: "inner", from: 2.5, to: 3.5 }
    const withOpening = (type: "door" | "window") =>
      project({
        ...room,
        walls: [wall],
        openings: [{ ...opening, type, bottom: 0, top: 2.1 }],
      })
    const door = withOpening("door")
    // The 0.65 m chair fits the 1 m doorway and ends on the far side.
    expect(constrainFurniturePose(door, chair(4, 3), { x: 2 })).toMatchObject({
      x: 2,
      z: 3,
    })
    // Manual placement crosses internal walls anywhere.
    expect(constrainFurniturePose(door, chair(4, 1), { x: 2 }).x).toBe(2)
    // Door jambs do not block movement either.
    expect(constrainFurniturePose(door, chair(4, 3.3), { x: 2 }).x).toBe(2)
    expect(
      constrainFurniturePose(withOpening("window"), chair(4, 3), { x: 2 }).x
    ).toBe(2)
    // The example home's bedroom door, from the living room side.
    const home = { ...sampleProject, furniture: [] }
    expect(constrainFurniturePose(home, chair(4, 3.85), { x: 2.4 }).x).toBe(2.4)
  })

  it("slides along walls and releases immediately when moved away", () => {
    const moved = constrainFurniturePose(project(), chair(2, 2), {
      x: -2,
      z: 4,
    })
    expect(moved.x).toBeCloseTo(0.425, 5)
    expect(moved.z).toBeCloseTo(4, 5)
    const parallel = constrainFurniturePose(project(), moved, { z: 3 })
    expect(parallel.z).toBeCloseTo(3, 5)
    const away = constrainFurniturePose(project(), parallel, { x: 0.48 })
    expect(away.x).toBe(0.48)
    expectSafe(away)
  })
  it("snaps both faces of a corner without jitter or penetration", () => {
    let moved = constrainFurniturePose(project(), chair(2, 2), {
      x: 0.49,
      z: 0.49,
    })
    expect(moved.x).toBeCloseTo(0.425, 5)
    expect(moved.z).toBeCloseTo(0.425, 5)
    const before = { ...moved }
    for (let i = 0; i < 20; i++)
      moved = constrainFurniturePose(project(), moved, { x: -5, z: -5 })
    expect(moved.x).toBeCloseTo(before.x, 5)
    expect(moved.z).toBeCloseTo(before.z, 5)
    expectSafe(moved)
  })
  it("crosses diagonal internal walls but blocks concave boundary crossings", () => {
    const diagonal = {
      ...room,
      walls: [
        {
          id: "diagonal",
          a: [0, 0] as [number, number],
          b: [6, 6] as [number, number],
          thickness: 0.2,
        },
      ],
    }
    const moved = constrainFurniturePose(project(diagonal), chair(1, 4), {
      x: 4,
      z: 1,
    })
    expect(moved).toMatchObject({ x: 4, z: 1 })
    expectSafe(moved, diagonal)
    const concave: RoomModel = {
      ...room,
      walls: [],
      outline: [
        [0, 0],
        [2.99, 0],
        [2.99, 4],
        [3.01, 4],
        [3.01, 0],
        [6, 0],
        [6, 6],
        [0, 6],
      ],
    }
    const stopped = constrainFurniturePose(project(concave), chair(1, 1), {
      x: 5,
    })
    expect(stopped.x).toBeCloseTo(2.665, 5)
    expectSafe(stopped, concave)
  })
  it("honors the selected room even when its edge has no wall", () => {
    const focus = {
      name: "작은 방",
      polygon: [
        [0, 0],
        [3, 0],
        [3, 6],
        [0, 6],
      ] as [number, number][],
    }
    const moved = constrainFurniturePose(
      project(),
      chair(1, 2),
      { x: 5 },
      focus
    )
    expect(moved.x).toBeCloseTo(2.675, 5)
  })
  it("checks the entire turn even if the final rotated footprint would fit", () => {
    const sofa = { ...chair(1.2, 3), catalogId: "sofa-cloud" }
    const rotated = constrainFurniturePose(project(), sofa, { rotation: 180 })
    expect(rotated.rotation).toBe(0)
    expectSafe(rotated)
    expect(
      constrainFurniturePose(project(), chair(3, 3), { rotation: 90 }).rotation
    ).toBe(90)
  })
  it("repairs an old invalid item only when edited and rejects non-finite input", () => {
    const invalid = chair(15, 15)
    const before = { ...invalid }
    const repaired = constrainFurniturePose(project(), invalid, { x: 1 })
    expectSafe(repaired)
    expect(invalid).toEqual(before)
    const current = chair(2, 2)
    expect(constrainFurniturePose(project(), current, { x: Infinity })).toBe(
      current
    )
  })
  it("finds a wall-safe insertion position and reports rooms too small to fit", () => {
    const placed = findFurniturePlacement(project(), chair(0, 0))
    expect(placed).not.toBeNull()
    expectSafe(placed!)
    const tiny: RoomModel = {
      ...room,
      bounds: { width: 0.5, depth: 0.5 },
      walls: [],
      outline: [
        [0, 0],
        [0.5, 0],
        [0.5, 0.5],
        [0, 0.5],
      ],
    }
    expect(findFurniturePlacement(project(tiny), chair(0.25, 0.25))).toBeNull()
  })

  it.each([0, 90])(
    "finds the narrow gap between sofas at %i degrees and rejects a smaller gap",
    (rotation) => {
      const model = buildRoomModel({
        rooms: [
          { id: "room", name: "거실", x: 0, z: 0, width: 5.3, depth: 1.2 },
        ],
        wallHeight: 2.4,
      })
      const sofas: Furniture[] = [1.2, 4.1].map((x, index) => ({
        ...chair(x, 0.6),
        id: `sofa-${index}`,
        catalogId: "sofa-cloud",
        name: "클라우드 소파",
        category: "소파",
      }))
      const scene = { ...project(model), furniture: sofas }
      const item = { ...chair(2.7, 0.6), rotation }
      expect(
        placementIssues({
          ...scene,
          furniture: [...sofas, { ...item, x: 2.65 }],
        })
      ).toEqual([])

      const placed = findFreePlacement(scene, item)
      expect(placed).not.toBeNull()
      expect(placed!.x).toBeGreaterThanOrEqual(2.625)
      expect(placed!.x).toBeLessThanOrEqual(2.675)
      expect(placed!.z).toBeCloseTo(0.6)
      expect(
        placementIssues({ ...scene, furniture: [...sofas, placed!] })
      ).toEqual([])

      expect(
        findFreePlacement(
          { ...scene, furniture: [sofas[0], { ...sofas[1], x: 4 }] },
          item
        )
      ).toBeNull()
    }
  )
})

describe("moving next to other furniture", () => {
  const other: Furniture = { ...chair(4, 3), id: "other" }
  const withOther = (...extra: Furniture[]): Project => ({
    ...project(),
    furniture: [other, ...extra],
  })
  // Both chairs are 0.65 m wide, so their faces meet at x = 3.35.
  const drag = (from: Furniture, x: number, layout = withOther()) =>
    constrainFurniturePose(layout, from, { x }).x

  it("holds a drag at another item's face within 10 cm on either side", () => {
    expect(drag(chair(2, 3), 3.3)).toBeCloseTo(3.35, 5)
    expect(drag(chair(2, 3), 3.43)).toBeCloseTo(3.35, 5)
    // Top and bottom faces attract the same way.
    const below = constrainFurniturePose(withOther(), chair(4, 5), { z: 3.6 })
    expect(below.z).toBeCloseTo(3.65, 5)
  })
  it("lets a drag pass once it is pushed more than 10 cm into the item", () => {
    expect(drag(chair(2, 3), 3.5)).toBe(3.5)
    expect(drag(chair(2, 3), 5)).toBe(5)
  })
  it("releases at once when moved away and ignores items it does not face", () => {
    expect(drag(chair(3.35, 3), 3.25)).toBe(3.25)
    const beside = constrainFurniturePose(withOther(), chair(2, 4.5), {
      x: 3.3,
    })
    expect(beside.x).toBe(3.3)
  })
  it("moves arrow-key steps through furniture without sticking", () => {
    const stepped = constrainFurniturePose(
      withOther(),
      chair(3.35, 3),
      { x: 3.45 },
      undefined,
      false
    )
    expect(stepped.x).toBe(3.45)
  })
  it("leaves stacked furniture where the user puts it", () => {
    const stacked = { ...chair(4.1, 3), id: "stacked" }
    const loaded = withOther(stacked)
    expect(placementIssues(loaded)).toHaveLength(2)
    expect(drag(stacked, 4.2, loaded)).toBe(4.2)
  })
})

describe("turns with no room", () => {
  const other: Furniture = { ...chair(4, 3), id: "other" }
  const sofa: Furniture = {
    ...chair(4, 4),
    id: "sofa",
    catalogId: "sofa-cloud",
  }
  const layout = (...furniture: Furniture[]): Project => ({
    ...project(),
    furniture,
  })

  it("names the furniture a finished turn would newly cover", () => {
    expect(turnBlocker(layout(other, sofa), sofa, 90)).toBe(other)
    expect(turnBlocker(layout(other, sofa), sofa, 180)).toBeNull()
    expect(turnBlocker(layout(other), chair(2, 3), 90)).toBeNull()
  })
  it("does not blame an item the furniture already overlaps", () => {
    const stacked = { ...sofa, z: 3.2 }
    expect(turnBlocker(layout(other, stacked), stacked, 90)).toBeNull()
  })
  it("reports the wall when the turn would sweep through it", () => {
    const flush = { ...sofa, x: 1.2, z: 3 }
    expect(turnBlocker(layout(flush), flush, 180)).toBe("wall")
  })
  it("refuses a turn that would recover an invalid item to another position", () => {
    const invalid = { ...sofa, x: -0.2, z: 3, rotation: 0 }
    expect(turnBlocker(layout(invalid), invalid, 90)).toBe("wall")
  })
})
