import { describe, expect, it } from "vite-plus/test"

import { holdStep, startHold, type Hold } from "./vr-grab"

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

  function holdTurn(stickX: number, seconds: number, initialRotation = 0) {
    let held = startHold("sofa", [1, 1], [1, 1], initialRotation)
    let rotation = initialRotation
    let steps = 0
    for (let time = 0; time < seconds; time += frame) {
      const next = holdStep(held, null, stickX, rotation, frame)
      held = next.held
      if (next.stepped) {
        steps++
        rotation = next.rotate!
      }
    }
    return { rotation, steps }
  }

  it("turns clockwise on right stick push and wraps angles into 0 to 359", () => {
    const right = holdStep(startHold("sofa", [1, 1], [1, 1], 360), null, 1, 360, frame)
    expect(right.stepped).toBe(true)
    expect(right.rotate).toBe(15)

    const left = holdStep(startHold("sofa", [1, 1], [1, 1], 0), null, -1, 0, frame)
    expect(left.stepped).toBe(true)
    expect(left.rotate).toBe(345)

    const wrapped = holdStep(startHold("sofa", [1, 1], [1, 1], 345), null, 1, 345, frame)
    expect(wrapped.rotate).toBe(0)
  })

  it("turns once for a short flick and repeats while held", () => {
    expect(holdTurn(1, 0.2).steps).toBe(1)
    expect(holdTurn(1, 1.05).steps).toBe(5)
  })

  it("waits for the stick to return before the next quick step", () => {
    let held = startHold("sofa", [1, 1], [1, 1], 0)
    const first = holdStep(held, null, 1, 0, frame)
    held = holdStep(first.held, null, 0, first.rotate!, frame).held
    const again = holdStep(held, null, 1, first.rotate!, frame)

    expect(again.stepped).toBe(true)
    expect(again.rotate).toBe(30)
  })

  it("does not jump to the ray when grabbed off-centre", () => {
    const held = startHold("sofa", [1, 1], [1.4, 0.8], 0)
    expect(holdStep(held, [1.4, 0.8], 0, 0, frame).move).toBeUndefined()
  })

  it("moves less than the ray so a small wrist turn is a small move", () => {
    const held = startHold("sofa", [1, 1], [1.4, 0.8], 0)
    const move = settle(held, [2.4, 0.8])

    expect(move?.[0]).toBeCloseTo(1.6, 2)
    expect(move?.[1]).toBeCloseTo(1, 2)
  })

  it("eases toward a sudden jump of the ray instead of snapping", () => {
    const held = startHold("sofa", [1, 1], [1, 1], 0)
    const first = holdStep(held, [2, 1], 0, 0, frame).move!

    expect(first[0]).toBeGreaterThan(1)
    expect(first[0]).toBeLessThan(1.15)
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
    const next = holdStep(held, [1.0005, 1], 0, 0, frame)

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
