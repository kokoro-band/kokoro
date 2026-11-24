export const rotationStep = 15
export const rotationDelay = 0.4
export const rotationRepeat = 0.2
const stickThreshold = 0.6

export type TurnState = {
  rotation: number
  armed: boolean
  repeatIn: number
  turned: boolean
}

/** Wraps into [0, 360). Fractional angles stay, only float noise is dropped. */
export function normalizeDegrees(value: number) {
  const wrapped = ((value % 360) + 360) % 360
  return (Math.round(wrapped * 1e6) / 1e6) % 360
}

export function startTurn(rotation: number): TurnState {
  return {
    rotation: normalizeDegrees(rotation),
    armed: true,
    repeatIn: 0,
    turned: false,
  }
}

export function turnHeld(
  state: TurnState,
  stickX: number,
  deltaSeconds: number
): { state: TurnState; stepped: boolean } {
  const push = Math.abs(stickX) > stickThreshold ? Math.sign(stickX) : 0
  if (!push) {
    return { state: { ...state, armed: true, repeatIn: 0 }, stepped: false }
  }

  const repeatIn = state.repeatIn - deltaSeconds
  if (!state.armed && repeatIn > 0) {
    return { state: { ...state, repeatIn }, stepped: false }
  }

  return {
    state: {
      rotation: normalizeDegrees(state.rotation + push * rotationStep),
      armed: false,
      repeatIn: state.armed ? rotationDelay : rotationRepeat,
      turned: true,
    },
    stepped: true,
  }
}

type Point = [x: number, z: number]

/** Smallest hand motion that moves held furniture, in metres. */
export const moveThreshold = 0.001
/**
 * How far held furniture moves for each metre the ray moves on the floor.
 * Far away a small wrist turn sweeps the ray a long way, so 1 felt twitchy.
 */
export const moveSensitivity = 0.6
/** Seconds to close most of the gap to the ray, so tremor does not jolt it. */
export const moveSmoothing = 0.1

export type Hold = {
  id: string
  startCenter: Point
  startHit: Point
  /** The eased position, which keeps converging between shown moves. */
  eased: Point
  /** The position last sent to the scene. */
  shown: Point
  turn: TurnState
}

export function startHold(
  id: string,
  center: Point,
  floorHit: Point,
  rotation: number
): Hold {
  return {
    id,
    startCenter: center,
    startHit: floorHit,
    eased: center,
    shown: center,
    turn: startTurn(rotation),
  }
}

/**
 * One frame of a VR grab. `rotation` is the furniture's current angle, which
 * walls may have clipped, so the next step starts from where it really is.
 */
export function holdStep(
  hold: Hold,
  floorHit: Point | null,
  stickX: number,
  rotation: number,
  deltaSeconds: number
): { held: Hold; move?: Point; rotate?: number; stepped: boolean } {
  const turned = turnHeld(
    { ...hold.turn, rotation: normalizeDegrees(rotation) },
    stickX,
    deltaSeconds
  )
  let eased = hold.eased
  let shown = hold.shown
  let move: Point | undefined
  if (floorHit) {
    const goal: Point = [
      hold.startCenter[0] + (floorHit[0] - hold.startHit[0]) * moveSensitivity,
      hold.startCenter[1] + (floorHit[1] - hold.startHit[1]) * moveSensitivity,
    ]
    // Frame-rate independent easing toward the goal.
    const ease = 1 - Math.exp(-deltaSeconds / moveSmoothing)
    eased = [
      eased[0] + (goal[0] - eased[0]) * ease,
      eased[1] + (goal[1] - eased[1]) * ease,
    ]
    if (Math.hypot(eased[0] - shown[0], eased[1] - shown[1]) >= moveThreshold) {
      move = eased
      shown = eased
    }
  }
  return {
    held: { ...hold, eased, shown, turn: turned.state },
    move,
    rotate: turned.stepped ? turned.state.rotation : undefined,
    stepped: turned.stepped,
  }
}
