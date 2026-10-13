import * as THREE from "three"

/** The controller that pressed or holds something, with its stick and haptics. */
export type VrHand = {
  ray: THREE.Ray
  stickX: number
  pulse: (intensity: number, milliseconds: number) => void
}

type Options = {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
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
const rayLength = 6
const rayColor = "#476B51"
const holdColor = "#FF6F0F"
const upAxis = new THREE.Vector3(0, 1, 0)
const floorPlane = new THREE.Plane(upAxis, 0)

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

  const raycaster = new THREE.Raycaster()
  const hitPoint = new THREE.Vector3()
  const headPosition = new THREE.Vector3()
  const rotation = new THREE.Matrix4()

  type ControllerState = {
    controller: THREE.XRTargetRaySpace
    line: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>
    marker: THREE.Mesh
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
    rotation.extractRotation(controller.matrixWorld)
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld)
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(rotation)
  }

  function walkableFloorHit(controller: THREE.Group) {
    setRayFrom(controller)
    if (!raycaster.ray.intersectPlane(floorPlane, hitPoint)) return null
    return isWalkable(hitPoint.x, hitPoint.z) ? hitPoint : null
  }

  function teleportTo(target: THREE.Vector3) {
    camera.getWorldPosition(headPosition)
    rig.position.x += target.x - headPosition.x
    rig.position.z += target.z - headPosition.z
  }

  function snapTurn(direction: 1 | -1) {
    camera.getWorldPosition(headPosition)
    const angle = -direction * snapTurnAngle
    rig.position
      .sub(headPosition)
      .applyAxisAngle(upAxis, angle)
      .add(headPosition)
    rig.rotation.y += angle
  }

  function handOf(state: ControllerState): VrHand {
    setRayFrom(state.controller)
    const gamepad = state.source?.gamepad as (Gamepad & Haptics) | undefined
    return {
      ray: raycaster.ray.clone(),
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
    state.line.material.color.set(holding ? holdColor : rayColor)
  }

  function press(state: ControllerState, button: Button) {
    if (!renderer.xr.getSession() || !state.connected || state.pressed) return
    // One hand carries at a time; the other hand must not teleport meanwhile.
    if (controllers.some((other) => other.holding)) return
    state.pressed = button
    const hand = handOf(state)
    setHolding(state, onSelectStart(hand.ray, hand))
  }

  /** The browser's select/squeeze event: the press finished, not cancelled. */
  function complete(state: ControllerState, button: Button) {
    if (state.pressed === button) state.completed = true
  }

  function release(state: ControllerState, button: Button) {
    if (!renderer.xr.getSession() || !state.connected) return
    if (state.pressed !== button) return
    if (state.holding) {
      // A press ends without select/squeeze when it is cancelled, for example
      // when the controller is lost. Held furniture then goes back.
      if (!state.completed) {
        interrupt(state)
        return
      }
      state.pressed = null
      state.completed = false
      const hand = handOf(state)
      onSelectEnd(hand.ray, hand)
      setHolding(state, false)
      return
    }
    state.pressed = null
    state.completed = false
    if (button === "squeeze") return
    const target = walkableFloorHit(state.controller)
    if (target) teleportTo(target)
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
        new THREE.Vector3(0, 0, -rayLength),
      ]),
      new THREE.LineBasicMaterial({ color: rayColor })
    )
    controller.add(line)
    rig.add(controller)

    const marker = new THREE.Mesh(
      new THREE.RingGeometry(0.18, 0.26, 32),
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

    camera.getWorldPosition(headPosition)
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

    let heldSource: XRInputSource | null = null
    for (const state of controllers) {
      if (state.holding) {
        heldSource = state.source
        state.marker.visible = false
        onHold?.(handOf(state), deltaSeconds)
        continue
      }
      const target = state.connected ? walkableFloorHit(state.controller) : null
      state.marker.visible = target !== null
      if (target) state.marker.position.set(target.x, 0.01, target.z)
    }

    for (const source of session.inputSources) {
      if (!source.gamepad) continue
      if (source === heldSource) {
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
      state.marker.geometry.dispose()
      ;(state.marker.material as THREE.Material).dispose()
      scene.remove(state.marker)
    }
    rig.remove(camera)
    scene.remove(rig)
  }

  return { rig, update, dispose }
}
