import { describe, expect, it } from "vite-plus/test"

import {
  alignEdges,
  analyzeFloorPlan,
  diagnosePlan,
  planToDraft,
  toGrayscale,
  type PlanAnalysis,
} from "./floor-plan"
import {
  buildRoomModel,
  draftAreaPyeong,
  hasOverlap,
  isConnected,
} from "./room-builder"

type Rect = { x: number; z: number; width: number; depth: number }

function drawPlan(
  width: number,
  height: number,
  rooms: Rect[],
  wall: number,
  doors: { x: number; z: number; length: number; vertical: boolean }[] = []
) {
  const gray = new Uint8Array(width * height).fill(255)
  const alpha = new Uint8Array(width * height).fill(255)

  const ink = (x: number, z: number) => {
    if (x < 0 || z < 0 || x >= width || z >= height) return
    gray[z * width + x] = 0
  }

  for (const room of rooms) {
    for (let x = room.x - wall; x < room.x + room.width + wall; x++) {
      for (let k = 0; k < wall; k++) {
        ink(x, room.z - wall + k)
        ink(x, room.z + room.depth + k)
      }
    }
    for (let z = room.z - wall; z < room.z + room.depth + wall; z++) {
      for (let k = 0; k < wall; k++) {
        ink(room.x - wall + k, z)
        ink(room.x + room.width + k, z)
      }
    }
  }

  for (const door of doors) {
    for (let step = 0; step < door.length; step++) {
      for (let k = -wall; k <= wall; k++) {
        const x = door.vertical ? door.x + k : door.x + step
        const z = door.vertical ? door.z + step : door.z + k
        if (x < 0 || z < 0 || x >= width || z >= height) continue
        gray[z * width + x] = 255
      }
    }
  }

  return { gray, alpha, width, height }
}

describe("alignEdges", () => {
  it("pulls nearby edges onto one line", () => {
    const aligned = alignEdges([1.02, 0.98, 1.0, 4.0])

    expect(aligned.get(1.02)).toBe(1)
    expect(aligned.get(0.98)).toBe(1)
    expect(aligned.get(4.0)).toBe(4)
  })

  it("keeps edges that are far apart", () => {
    const aligned = alignEdges([0, 2, 4])

    expect([...new Set(aligned.values())]).toEqual([0, 2, 4])
  })
})

describe("analyzeFloorPlan", () => {
  it("finds two rooms split by a wall", () => {
    const plan = drawPlan(
      300,
      200,
      [
        { x: 20, z: 20, width: 120, depth: 140 },
        { x: 152, z: 20, width: 120, depth: 140 },
      ],
      6
    )
    const analysis = analyzeFloorPlan(
      plan.gray,
      plan.alpha,
      plan.width,
      plan.height
    )

    expect(analysis.regions).toHaveLength(2)
    expect(analysis.wallThickness).toBeGreaterThan(3)
    expect(analysis.wallThickness).toBeLessThan(15)
  })

  it("keeps rooms apart when a doorway joins them", () => {
    const plan = drawPlan(
      300,
      200,
      [
        { x: 20, z: 20, width: 120, depth: 140 },
        { x: 152, z: 20, width: 120, depth: 140 },
      ],
      6,
      [{ x: 146, z: 70, length: 40, vertical: true }]
    )
    const analysis = analyzeFloorPlan(
      plan.gray,
      plan.alpha,
      plan.width,
      plan.height
    )

    expect(analysis.regions).toHaveLength(2)
    expect(analysis.doorWidth).toBeGreaterThan(analysis.wallThickness)
  })

  it("returns nothing for a blank image", () => {
    const gray = new Uint8Array(100 * 100).fill(255)
    const alpha = new Uint8Array(100 * 100).fill(255)

    expect(analyzeFloorPlan(gray, alpha, 100, 100).regions).toEqual([])
  })
})

describe("planToDraft", () => {
  const analysis = (regions: PlanAnalysis["regions"]): PlanAnalysis => ({
    width: 300,
    height: 200,
    threshold: 128,
    wallThickness: 6,
    doorWidth: 48,
    wall: new Uint8Array(0),
    closed: new Uint8Array(0),
    label: new Int32Array(0),
    regions,
  })

  const twoRooms = analysis([
    {
      id: 0,
      pixels: 120 * 140,
      rect: { x: 20, y: 20, width: 120, height: 140 },
    },
    {
      id: 1,
      pixels: 120 * 140,
      rect: { x: 152, y: 20, width: 120, height: 140 },
    },
  ])

  it("makes the rooms touch so the layout is closed", () => {
    const draft = planToDraft(twoRooms, 20)

    expect(draft.rooms).toHaveLength(2)
    expect(isConnected(draft)).toBe(true)
    expect(hasOverlap(draft)).toBe(false)
    expect(buildRoomModel(draft).outline).toHaveLength(4)
  })

  it("starts the layout at the origin", () => {
    const draft = planToDraft(twoRooms, 20)

    expect(Math.min(...draft.rooms.map((room) => room.x))).toBe(0)
    expect(Math.min(...draft.rooms.map((room) => room.z))).toBe(0)
  })

  it("scales the plan to the given area", () => {
    expect(draftAreaPyeong(planToDraft(twoRooms, 30))).toBeCloseTo(30, 0)
  })

  it("records where the layout came from", () => {
    expect(planToDraft(twoRooms, 20).source).toEqual({
      areaPyeong: 20,
      roomCount: 2,
      preset: "plan-v1",
    })
  })

  it("drops rooms that are too small to edit", () => {
    const tiny = analysis([
      ...twoRooms.regions,
      { id: 2, pixels: 9, rect: { x: 280, y: 180, width: 3, height: 3 } },
    ])

    expect(planToDraft(tiny, 20).rooms).toHaveLength(2)
  })

  it("returns an empty draft when nothing was found", () => {
    expect(planToDraft(analysis([]), 20).rooms).toEqual([])
  })
})

describe("plan to draft end to end", () => {
  it("turns a drawn plan into an editable layout", () => {
    const plan = drawPlan(
      400,
      300,
      [
        { x: 20, z: 20, width: 160, depth: 100 },
        { x: 192, z: 20, width: 160, depth: 100 },
        { x: 20, z: 132, width: 332, depth: 130 },
      ],
      6,
      [{ x: 186, z: 60, length: 40, vertical: true }]
    )
    const analysis = analyzeFloorPlan(
      plan.gray,
      plan.alpha,
      plan.width,
      plan.height
    )
    const draft = planToDraft(analysis, 24)

    expect(draft.rooms).toHaveLength(3)
    expect(isConnected(draft)).toBe(true)
    expect(hasOverlap(draft)).toBe(false)
    expect(draftAreaPyeong(draft)).toBeGreaterThan(22)
    expect(draftAreaPyeong(draft)).toBeLessThan(26)
    expect(buildRoomModel(draft).outline).toHaveLength(4)
  })
})

describe("toGrayscale", () => {
  it("turns colour pixels into brightness and keeps alpha", () => {
    const data = new Uint8Array([255, 255, 255, 255, 0, 0, 0, 128])
    const { gray, alpha } = toGrayscale(data, 2, 1)

    expect([...gray]).toEqual([255, 0])
    expect([...alpha]).toEqual([255, 128])
  })
})

describe("diagnosePlan", () => {
  function fill(width: number, height: number, rgb: [number, number, number]) {
    const data = new Uint8Array(width * height * 4)
    for (let i = 0; i < width * height; i++) {
      data.set([...rgb, 255], i * 4)
    }
    return data
  }

  it("accepts a large black and white plan", () => {
    expect(diagnosePlan(fill(800, 800, [255, 255, 255]), 800, 800)).toEqual([])
  })

  it("warns about a small image", () => {
    expect(diagnosePlan(fill(300, 300, [255, 255, 255]), 300, 300)).toContain(
      "small"
    )
  })

  it("warns about a coloured plan", () => {
    expect(diagnosePlan(fill(800, 800, [200, 150, 90]), 800, 800)).toContain(
      "colorful"
    )
  })
})
