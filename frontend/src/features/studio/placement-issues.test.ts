import { describe, expect, it } from "vite-plus/test"

import { sampleProject } from "./data"
import { placementIssues } from "./placement-issues"
import type { Furniture, Project, RoomModel } from "./types"

const chair = (id: string, x: number, z: number, rotation = 0): Furniture => ({
  id,
  catalogId: "chair-shell",
  name: id,
  category: "의자",
  x,
  z,
  rotation,
  color: "#000000",
})
const room: RoomModel = {
  version: 2,
  unit: "m",
  wallHeight: 2.4,
  bounds: { width: 5.8, depth: 4.2 },
  outline: [
    [0, 0],
    [5.8, 0],
    [5.8, 4.2],
    [0, 4.2],
  ],
  walls: [],
  openings: [],
  rooms: [],
}
const project = (furniture: Furniture[], model?: RoomModel): Project => ({
  ...sampleProject,
  dimensions: { width: 5.8, depth: 4.2, height: 2.4 },
  room: model,
  furniture,
})

describe("repairable placement issues", () => {
  it("opens the bundled sample without placement warnings", () => {
    expect(placementIssues(sampleProject)).toEqual([])
  })

  // Coordinates match FurniturePlacementValidatorTest on the server.
  it("does not invent furniture or flag touching edges", () => {
    expect(placementIssues(project([], room))).toEqual([])
    expect(
      placementIssues(project([chair("a", 0.325, 2.1), chair("b", 5.475, 2.1)]))
    ).toEqual([])
  })

  it("checks the full rotated footprint and flags both sides of a collision", () => {
    expect(
      placementIssues(
        project([{ ...chair("sofa", 5.5, 2.1), catalogId: "sofa-cloud" }])
      )[0].reason
    ).toContain("경계")
    expect(
      placementIssues(project([chair("a", 2.9, 2.1, 45), chair("b", 3.2, 2.1)]))
    ).toEqual([
      { furnitureId: "a", reason: "다른 가구와 겹쳐 있어요." },
      { furnitureId: "b", reason: "다른 가구와 겹쳐 있어요." },
    ])
  })

  it("checks concave edges even when the corners are inside", () => {
    const model: RoomModel = {
      ...room,
      bounds: { width: 6, depth: 4 },
      outline: [
        [0, 0],
        [6, 0],
        [6, 2],
        [3, 2],
        [3, 4],
        [0, 4],
      ],
    }
    expect(
      placementIssues(
        project(
          [{ ...chair("table", 3.3, 2.2, 45), catalogId: "table-oak" }],
          model
        )
      )[0].reason
    ).toContain("경계")
    expect(
      placementIssues(project([chair("inside", 1.5, 3.5)], model))
    ).toEqual([])
  })

  it("checks wall thickness and the door clearance heuristic", () => {
    const wallRoom: RoomModel = {
      ...room,
      walls: [{ id: "wall", a: [3, 0], b: [3, 4.2], thickness: 0.2 }],
    }
    expect(
      placementIssues(project([chair("a", 3, 2)], wallRoom))[0].reason
    ).toContain("벽")
    const doorRoom: RoomModel = {
      ...room,
      walls: [{ id: "front", a: [0, 0], b: [5.8, 0], thickness: 0.2 }],
      openings: [
        {
          id: "door",
          wallId: "front",
          type: "door",
          from: 2.4,
          to: 3.4,
          bottom: 0,
          top: 2.1,
        },
      ],
    }
    expect(
      placementIssues(project([chair("a", 3, 0.5)], doorRoom))[0].reason
    ).toContain("문 앞")
    expect(placementIssues(project([chair("a", 5, 2)], doorRoom))).toEqual([])
  })

  it("clears issues individually after moving or removing items without mutating the project", () => {
    const draft = project([chair("a", 15, 15), chair("b", 16, 16)], room)
    const before = structuredClone(draft)
    expect(placementIssues(draft)).toHaveLength(2)
    expect(draft).toEqual(before)
    const partial = {
      ...draft,
      furniture: [chair("a", 2, 15), draft.furniture[1]],
    }
    expect(placementIssues(partial)).toHaveLength(2)
    const repaired = {
      ...draft,
      furniture: [chair("a", 2, 2), draft.furniture[1]],
    }
    expect(placementIssues(repaired).map((issue) => issue.furnitureId)).toEqual(
      ["b"]
    )
    expect(
      placementIssues({ ...repaired, furniture: [repaired.furniture[0]] })
    ).toEqual([])
  })

  it("reports unknown or invalid local furniture instead of throwing", () => {
    expect(
      placementIssues(
        project([
          { ...chair("a", 1, 1), catalogId: "missing" },
          chair("b", NaN, 2),
        ])
      )
    ).toHaveLength(2)
  })
})
