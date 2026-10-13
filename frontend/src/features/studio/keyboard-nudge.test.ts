import { describe, expect, it } from "vite-plus/test"
import { nudgeDirection, viewForward } from "./keyboard-nudge"

describe("arrow keys follow the view", () => {
  it("keeps plan directions in 2D and in the default 3D view", () => {
    // 2D looks straight down, and the first 3D view looks up the plan.
    for (const forward of [viewForward(0, -0.01), viewForward(-5, -7)]) {
      expect(nudgeDirection("ArrowUp", forward)).toEqual([0, -1])
      expect(nudgeDirection("ArrowDown", forward)).toEqual([0, 1])
      expect(nudgeDirection("ArrowLeft", forward)).toEqual([-1, 0])
      expect(nudgeDirection("ArrowRight", forward)).toEqual([1, 0])
    }
  })
  it("turns with the camera in quarter steps so moves stay on the plan axes", () => {
    const behind = viewForward(2, 7)
    expect(nudgeDirection("ArrowUp", behind)).toEqual([0, 1])
    expect(nudgeDirection("ArrowRight", behind)).toEqual([-1, 0])
    const side = viewForward(6, -1)
    expect(nudgeDirection("ArrowUp", side)).toEqual([1, 0])
    expect(nudgeDirection("ArrowRight", side)).toEqual([0, 1])
    expect(nudgeDirection("ArrowLeft", side)).toEqual([0, -1])
  })
  it("falls back to plan directions without a view and ignores other keys", () => {
    expect(viewForward(0, 0)).toEqual([0, -1])
    expect(viewForward(NaN, 1)).toEqual([0, -1])
    expect(nudgeDirection("KeyA", [0, -1])).toBeNull()
  })
})
