import * as THREE from "three"
import { createVrAim, type VrAim } from "./vr-aim"

/** The controller that pressed or holds something, with its stick and haptics. */
export type VrHand = {
  ray: THREE.Ray
  target: VrAim | null
  stickX: number
  pulse: (intensity: number, milliseconds: number) => void
}

type Options = {
  roomGroup: THREE.Group
  furnitureGroup: THREE.Group
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.Camera
  spawn: THREE.Vector3
  isWalkable: (x: number, z: number) => boolean
  /** Trigger or grip pressed. Returning true holds the press instead of teleporting. */
  onSelectStart: (ray: THREE.Ray, hand: VrHand) => boolean
  onSelectEnd: (ray: THREE.Ray, hand: VrHand) => boolean
  /** Every frame while a press is held. That hand's stick is not used for turning. */
  onHold?: (hand: VrHand, deltaSeconds: number) => void
  /** A held press ended without a release (session end or controller loss). */
  onCancel?: () => void
}

type Button = "select" | "squeeze"
type Haptics = {
  hapticActuators?: readonly {
    pulse?: (value: number, ms: number) => unknown
  }[]
}

const snapTurnAngle = THREE.MathUtils.degToRad(30)
const walkSpeed = 1.6
const walkDeadZone = 0.15
const rayColor = "#326C50"
const blockedColor = "#777471"
const holdColor = "#FF6F0F"
const upAxis = new THREE.Vector3(0, 1, 0)

export function createVrLocomotion(options: Options) {
  const {
    renderer,
    scene,
    camera,
    spawn,
    isWalkable,
    onSelectStart,
    onSelectEnd,
    onHold,
    onCancel,
  } = options

  const rig = new THREE.Group()
  rig.add(camera)
  scene.add(rig)

  const ray = new THREE.Ray()
  const aim = createVrAim(options.roomGroup, options.furnitureGroup, isWalkable)
  const floorRing = new THREE.RingGeometry(0.17, 0.22, 32)
  const objectDot = new THREE.SphereGeometry(0.02, 12, 8)
  const headPosition = new THREE.Vector3()
  const rotation = new THREE.Matrix4()

  type ControllerState = {
    controller: THREE.XRTargetRaySpace
    line: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>
    marker: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>
    heldId: string | null
    holding: boolean
    pressed: Button | null
    completed: boolean
    connected: boolean
    source: XRInputSource | null
    onStart: () => void
    onSelect: () => void
    onEnd: () => void
    onSqueezeStart: () => void
    onSqueeze: () => void
    onSqueezeEnd: () => void
    onConnected: (event: { data?: unknown }) => void
    onDisconnected: () => void
  }
  const controllers: ControllerState[] = []

  function setRayFrom(controller: THREE.Group) {
    controller.updateWorldMatrix(true, false)
    rotation.extractRotation(controller.matrixWorld)
    ray.origin.setFromMatrixPosition(controller.matrixWorld)
    ray.direction.set(0, 0, -1).applyMatrix4(rotation)
  }

  function aimFrom(state: ControllerState) {
    setRayFrom(state.controller)
    return aim(ray, state.heldId)
  }

  function readHeadPosition() {
    const eyes = renderer.xr.getCamera().cameras
    if (!eyes.length) return camera.getWorldPosition(headPosition)
    // Three shifts the combined culling camera behind the tracked eyes.
    headPosition.set(0, 0, 0)
    for (const eye of eyes) headPosition.add(eye.position)
    return rig.localToWorld(headPosition.divideScalar(eyes.length))
  }

  function teleportTo(target: THREE.Vector3) {
    readHeadPosition()
    rig.position.x += target.x - headPosition.x
    rig.position.z += target.z - headPosition.z
  }

  function snapTurn(direction: 1 | -1) {
    readHeadPosition()
    const angle = -direction * snapTurnAngle
    rig.position
      .sub(headPosition)
      .applyAxisAngle(upAxis, angle)
      .add(headPosition)
    rig.rotation.y += angle
  }

  function handOf(state: ControllerState, target: VrAim | null): VrHand {
    const gamepad = state.source?.gamepad as (Gamepad & Haptics) | undefined
    return {
      ray: ray.clone(),
      target,
      stickX: gamepad?.axes[2] ?? 0,
      pulse(intensity, milliseconds) {
        // Haptics are optional and some runtimes reject the promise.
        void Promise.resolve(
          gamepad?.hapticActuators?.[0]?.pulse?.(intensity, milliseconds)
        ).catch(() => undefined)
      },
    }
  }

  function setHolding(state: ControllerState, holding: boolean) {
    state.holding = holding
    if (!holding) state.heldId = null
  }

  function press(state: ControllerState, button: Button) {
    if (!renderer.xr.getSession() || !state.connected || state.pressed) return
    // One hand carries at a time; the other hand must not teleport meanwhile.
    if (controllers.some((other) => other.holding)) return
    const target = aimFrom(state)
    if (!target || target.kind === "blocked") return
    state.pressed = button
    const hand = handOf(state, target)
    setHolding(state, onSelectStart(hand.ray, hand))
    if (state.holding && target.kind === "furniture") state.heldId = target.id
  }

  /** The browser's select/squeeze event: the press finished, not cancelled. */
  function complete(state: ControllerState, button: Button) {
    if (state.pressed === button) state.completed = true
  }

  function release(state: ControllerState, button: Button) {
    if (!renderer.xr.getSession() || !state.connected) return
    if (state.pressed !== button) return
    if (!state.completed) {
      interrupt(state)
      return
    }
    state.pressed = null
    state.completed = false
    const target = aimFrom(state)
    if (state.holding) {
      const hand = handOf(state, target)
      onSelectEnd(hand.ray, hand)
      setHolding(state, false)
    } else if (
      button === "select" &&
      target?.kind === "floor" &&
      !controllers.some((other) => other.holding)
    ) {
      teleportTo(target.point)
    }
  }

  /** Drop a press without a release so the held furniture goes back. */
  function interrupt(state: ControllerState) {
    const held = state.holding
    state.pressed = null
    state.completed = false
    setHolding(state, false)
    if (held) onCancel?.()
  }

  for (const index of [0, 1]) {
    const controller = renderer.xr.getController(index)
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(),
        new THREE.Vector3(0, 0, -1),
      ]),
      new THREE.LineBasicMaterial({ color: rayColor })
    )
    line.visible = false
    controller.add(line)
    rig.add(controller)

    const marker = new THREE.Mesh<
      THREE.BufferGeometry,
      THREE.MeshBasicMaterial
    >(
      floorRing,
      new THREE.MeshBasicMaterial({
        color: "#3D7351",
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8,
      })
    )
    marker.rotation.x = -Math.PI / 2
    marker.visible = false
    scene.add(marker)

    const state: ControllerState = {
      controller,
      line,
      marker,
      heldId: null,
      holding: false,
      pressed: null,
      completed: false,
      connected: true,
      source: null,
      onStart: () => press(state, "select"),
      onSelect: () => complete(state, "select"),
      onEnd: () => release(state, "select"),
      onSqueezeStart: () => press(state, "squeeze"),
      onSqueeze: () => complete(state, "squeeze"),
      onSqueezeEnd: () => release(state, "squeeze"),
      onConnected(event) {
        state.connected = true
        if (event.data) state.source = event.data as XRInputSource
      },
      onDisconnected() {
        state.connected = false
        interrupt(state)
        state.source = null
        state.marker.visible = false
        state.line.visible = false
      },
    }
    controller.addEventListener("selectstart", state.onStart)
    controller.addEventListener("select", state.onSelect)
    controller.addEventListener("selectend", state.onEnd)
    controller.addEventListener("squeezestart", state.onSqueezeStart)
    controller.addEventListener("squeeze", state.onSqueeze)
    controller.addEventListener("squeezeend", state.onSqueezeEnd)
    controller.addEventListener("connected", state.onConnected)
    controller.addEventListener("disconnected", state.onDisconnected)
    controllers.push(state)
  }

  let turnArmed = true
  let desktopPose: {
    position: THREE.Vector3
    quaternion: THREE.Quaternion
  } | null = null
  function resetInput() {
    turnArmed = true
    for (const state of controllers) {
      interrupt(state)
      state.marker.visible = false
      state.line.visible = false
    }
  }
  function moveToSpawn() {
    desktopPose = {
      position: camera.position.clone(),
      quaternion: camera.quaternion.clone(),
    }
    resetInput()
    rig.position.copy(spawn)
    rig.rotation.set(0, 0, 0)
  }
  function resetRig() {
    resetInput()
    rig.position.set(0, 0, 0)
    rig.rotation.set(0, 0, 0)
    if (desktopPose) {
      camera.position.copy(desktopPose.position)
      camera.quaternion.copy(desktopPose.quaternion)
      desktopPose = null
    }
  }
  renderer.xr.addEventListener("sessionstart", moveToSpawn)
  renderer.xr.addEventListener("sessionend", resetRig)

  const clock = new THREE.Clock()
  const headDirection = new THREE.Vector3()
  const sideDirection = new THREE.Vector3()
  const step = new THREE.Vector3()

  function walk(stickX: number, stickY: number, deltaSeconds: number) {
    const magnitude = Math.hypot(stickX, stickY)
    if (magnitude < walkDeadZone) return

    camera.getWorldDirection(headDirection)
    headDirection.y = 0
    if (headDirection.lengthSq() === 0) return
    headDirection.normalize()
    sideDirection.crossVectors(headDirection, upAxis)

    step
      .copy(headDirection)
      .multiplyScalar(-stickY)
      .addScaledVector(sideDirection, stickX)
      .multiplyScalar(walkSpeed * deltaSeconds)

    readHeadPosition()
    const nextX = headPosition.x + step.x
    const nextZ = headPosition.z + step.z
    if (!isWalkable(nextX, nextZ)) return
    rig.position.x += step.x
    rig.position.z += step.z
  }

  function update() {
    const session = renderer.xr.getSession()
    const deltaSeconds = Math.min(clock.getDelta(), 0.1)
    if (!session) return

    const activeHand = controllers.find((state) => state.holding)
    for (const state of controllers) {
      const enabled = state.connected && (!activeHand || activeHand === state)
      state.line.visible = enabled
      const target = enabled ? aimFrom(state) : null
      state.line.scale.z = target?.distance ?? 0.35
      const actionable = target?.kind === "furniture" || target?.kind === "door"
      const color =
        state.holding || actionable
          ? holdColor
          : target?.kind === "floor"
            ? rayColor
            : blockedColor
      state.line.material.color.set(color)
      state.marker.visible =
        !state.holding && !!target && target.kind !== "blocked"
      if (target && state.marker.visible) {
        state.marker.geometry = actionable ? objectDot : floorRing
        state.marker.material.color.set(color)
        state.marker.position.copy(target.point)
        if (actionable)
          state.marker.position.addScaledVector(ray.direction, -0.006)
        else state.marker.position.y += 0.01
      }
      if (state.holding) onHold?.(handOf(state, target), deltaSeconds)
    }

    for (const source of session.inputSources) {
      if (!source.gamepad) continue
      if (source === activeHand?.source) {
        // The stick turns the held furniture. Releasing with the stick still
        // tilted must not turn the player until it returns to the centre.
        if (source.handedness === "right") turnArmed = false
        continue
      }
      const stickX = source.gamepad.axes[2] ?? 0
      const stickY = source.gamepad.axes[3] ?? 0
      if (source.handedness === "left") {
        walk(stickX, stickY, deltaSeconds)
      } else if (source.handedness === "right") {
        if (turnArmed && Math.abs(stickX) > 0.7) {
          snapTurn(stickX > 0 ? 1 : -1)
          turnArmed = false
        } else if (Math.abs(stickX) < 0.3) {
          turnArmed = true
        }
      }
    }
  }

  function dispose() {
    renderer.xr.removeEventListener("sessionstart", moveToSpawn)
    renderer.xr.removeEventListener("sessionend", resetRig)
    resetRig()
    for (const state of controllers) {
      state.controller.removeEventListener("selectstart", state.onStart)
      state.controller.removeEventListener("select", state.onSelect)
      state.controller.removeEventListener("selectend", state.onEnd)
      state.controller.removeEventListener("squeezestart", state.onSqueezeStart)
      state.controller.removeEventListener("squeeze", state.onSqueeze)
      state.controller.removeEventListener("squeezeend", state.onSqueezeEnd)
      state.controller.removeEventListener("connected", state.onConnected)
      state.controller.removeEventListener("disconnected", state.onDisconnected)
      state.controller.remove(state.line)
      rig.remove(state.controller)
      state.line.geometry.dispose()
      state.line.material.dispose()
      state.marker.material.dispose()
      scene.remove(state.marker)
    }
    floorRing.dispose()
    objectDot.dispose()
    rig.remove(camera)
    scene.remove(rig)
  }

  return { rig, update, dispose }
}
