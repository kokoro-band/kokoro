import type { Point2 } from "./types"

/** Up the plan. This is the top of the screen in 2D and in the first 3D view. */
const planForward: Point2 = [0, -1]

/**
 * The plan axis that points most nearly away from the camera, from the floor
 * offset between the camera and the spot it looks at. Quarter steps keep arrow
 * moves on the plan's own axes however the 3D view is turned.
 */
export function viewForward(dx: number, dz: number): Point2 {
  if (!Number.isFinite(dx) || !Number.isFinite(dz) || Math.hypot(dx, dz) < 1e-6)
    return planForward
  return Math.abs(dx) > Math.abs(dz) ? [Math.sign(dx), 0] : [0, Math.sign(dz)]
}

/** The plan direction an arrow key points to on screen. */
export function nudgeDirection(code: string, forward: Point2): Point2 | null {
  const [x, z] = forward
  const turned: Record<string, Point2> = {
    ArrowUp: [x, z],
    ArrowDown: [-x, -z],
    ArrowRight: [-z, x],
    ArrowLeft: [z, -x],
  }
  const direction = turned[code]
  // Adding zero turns a negated zero back into a plain one.
  return direction ? [direction[0] + 0, direction[1] + 0] : null
}
