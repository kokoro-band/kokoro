import { describe, expect, it } from "vite-plus/test"

import {
  holdStep,
  moveSensitivity,
  moveThreshold,
  normalizeDegrees,
  startHold,
  rotationDelay,
  rotationRepeat,
  startTurn,
  turnHeld,
  type Hold,
} from "./vr-grab"

function hold(stickX: number, seconds: number, from = startTurn(0)) {
  let state = from
  let steps = 0
  const frame = 1 / 72
  for (let time = 0; time < seconds; time += frame) {
    const next = turnHeld(state, stickX, frame)
    state = next.state
    if (next.stepped) steps++
  }
  return { state, steps }
}

describe("normalizeDegrees", () => {
  it("wraps angles into 0 to 359", () => {
    expect(normalizeDegrees(-15)).toBe(345)
    expect(normalizeDegrees(360)).toBe(0)
    expect(normalizeDegrees(375)).toBe(15)
  })

  it("keeps the fractional angle a wall left behind", () => {
    expect(normalizeDegrees(37.5)).toBe(37.5)
    expect(turnHeld(startTurn(37.5), 1, 1 / 72).state.rotation).toBe(52.5)
  })
})

describe("turnHeld", () => {
  it("turns clockwise seen from above when the stick is pushed right", () => {
    const { state, stepped } = turnHeld(startTurn(0), 1, 1 / 72)

    expect(stepped).toBe(true)
    expect(state.rotation).toBe(15)
    expect(state.turned).toBe(true)
  })

  it("turns the other way when the stick is pushed left", () => {
    expect(turnHeld(startTurn(0), -1, 1 / 72).state.rotation).toBe(345)
  })

  it("ignores a light touch on the stick", () => {
    const { state, stepped } = turnHeld(startTurn(90), 0.4, 1 / 72)

    expect(stepped).toBe(false)
    expect(state.rotation).toBe(90)
    expect(state.turned).toBe(false)
  })

  it("turns once for a short flick", () => {
    expect(hold(1, 0.2).steps).toBe(1)
  })

  it("keeps turning while the stick is held", () => {
    const seconds = rotationDelay + rotationRepeat * 3 + 0.05
    const { steps } = hold(1, seconds)

    expect(steps).toBe(5)
  })

  it("waits for the stick to return before the next quick step", () => {
    let state = startTurn(0)
    state = turnHeld(state, 1, 1 / 72).state
    state = turnHeld(state, 0, 1 / 72).state
    const again = turnHeld(state, 1, 1 / 72)

    expect(again.stepped).toBe(true)
    expect(again.state.rotation).toBe(30)
  })
})

describe("holdStep", () => {
  const frame = 1 / 72

  /** Holds the ray still at `hit` long enough for the smoothing to settle. */
  function settle(held: Hold, hit: [number, number]) {
    let move: [number, number] | undefined
    for (let i = 0; i < 144; i++) {
      const next = holdStep(held, hit, 0, 0, frame)
      held = next.held
      move = next.move ?? move
    }
    return move
  }

  it("does not jump to the ray when grabbed off-centre", () => {
    const held = startHold("sofa", [1, 1], [1.4, 0.8], 0)
    expect(holdStep(held, [1.4, 0.8], 0, 0, frame).move).toBeUndefined()
  })

  it("moves less than the ray so a small wrist turn is a small move", () => {
    const held = startHold("sofa", [1, 1], [1.4, 0.8], 0)
    const move = settle(held, [2.4, 0.8])

    expect(move?.[0]).toBeCloseTo(1 + moveSensitivity, 2)
    expect(move?.[1]).toBeCloseTo(1, 2)
  })

  it("eases toward a sudden jump of the ray instead of snapping", () => {
    const held = startHold("sofa", [1, 1], [1, 1], 0)
    const first = holdStep(held, [2, 1], 0, 0, frame).move!

    expect(first[0]).toBeGreaterThan(1)
    expect(first[0]).toBeLessThan(1 + moveSensitivity / 4)
  })

  it("eases at the same speed whatever the frame rate", () => {
    const at = (fps: number) => {
      let held = startHold("sofa", [1, 1], [1, 1], 0)
      let x = 1
      for (let i = 0; i < fps / 10; i++) {
        const next = holdStep(held, [2, 1], 0, 0, 1 / fps)
        held = next.held
        x = next.move?.[0] ?? x
      }
      return x
    }

    expect(at(60)).toBeCloseTo(at(120), 2)
  })

  it("ignores hand jitter smaller than a millimetre", () => {
    const held = startHold("sofa", [1, 1], [1, 1], 0)
    const next = holdStep(held, [1 + moveThreshold / 2, 1], 0, 0, frame)

    expect(next.move).toBeUndefined()
  })

  it("keeps the last position when the ray leaves the floor", () => {
    const held = startHold("sofa", [1, 1], [1, 1], 0)
    expect(holdStep(held, null, 0, 0, frame).move).toBeUndefined()
  })

  it("turns from the angle the walls allowed, not the angle it asked for", () => {
    let held = startHold("sofa", [1, 1], [1, 1], 0)
    const first = holdStep(held, null, 1, 0, frame)
    expect(first.rotate).toBe(15)
    held = holdStep(first.held, null, 0, 7.5, frame).held
    const second = holdStep(held, null, 1, 7.5, frame)

    expect(second.rotate).toBe(22.5)
  })

  it("does not turn on a light touch", () => {
    const held = startHold("sofa", [1, 1], [1, 1], 90)
    const next = holdStep(held, null, 0.3, 90, frame)

    expect(next.rotate).toBeUndefined()
    expect(next.stepped).toBe(false)
  })
})
