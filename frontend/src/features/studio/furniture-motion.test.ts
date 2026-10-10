import { describe, expect, it } from "vite-plus/test"
import { sampleProject } from "./data"
import {
  constrainFurniturePose,
  findFurniturePlacement,
} from "./furniture-motion"
import {
  footprint,
  insideRoom,
  overlaps,
  placementIssues,
  wallBox,
} from "./placement-issues"
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
  })
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

  it("snaps to either internal wall face, holds slight pressure, and releases deliberate crossing", () => {
    const model = {
      ...room,
      walls: [
        ...room.walls,
        { id: "divider", a: [3, 0], b: [3, 6], thickness: 0.2 } as Wall,
      ],
    }
    for (const side of [-1, 1]) {
      const start = chair(3 + side, 2)
      const face = 3 + side * 0.425
      const snapped = constrainFurniturePose(project(model), start, {
        x: face + side * 0.06,
      })
      expect(snapped.x).toBeCloseTo(face, 5)
      const held = constrainFurniturePose(project(model), snapped, {
        x: face - side * 0.06,
        z: 3,
      })
      expect(held).toMatchObject({ z: 3 })
      expect(held.x).toBeCloseTo(face, 5)
      expectSafe(held, model)
      const released = constrainFurniturePose(project(model), held, {
        x: face - side * 0.15,
      })
      expect(released.x).toBeCloseTo(face - side * 0.15, 5)
      expect(
        placementIssues({ ...project(model), furniture: [released] })[0].reason
      ).toContain("벽")
      expect(
        constrainFurniturePose(project(model), snapped, {
          x: face + side * 0.02,
        }).x
      ).toBeCloseTo(face + side * 0.02, 5)
      expect(
        constrainFurniturePose(project(model), released, { x: 3 - side }).x
      ).toBe(3 - side)
    }
  })

  it("uses the rotated footprint when snapping and leaves a doorway free", () => {
    const wall: Wall = { id: "divider", a: [3, 0], b: [3, 6], thickness: 0.2 }
    const model = { ...room, walls: [wall] }
    const item = { ...chair(1, 2), rotation: 45 }
    const box = footprint(item)!
    const face = 3 - 0.1 - (box.width + box.depth) / Math.sqrt(2)
    const moved = constrainFurniturePose(project(model), item, {
      x: face - 0.05,
    })
    expect(moved.x).toBeCloseTo(face, 5)
    expectSafe(moved, model)
    const doorway: RoomModel = {
      ...model,
      openings: [
        {
          id: "door",
          wallId: wall.id,
          type: "door",
          from: 2.5,
          to: 3.5,
          bottom: 0,
          top: 2.1,
        },
      ],
    }
    expect(
      constrainFurniturePose(project(doorway), chair(1, 3), { x: 2.52 }).x
    ).toBe(2.52)
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
})
