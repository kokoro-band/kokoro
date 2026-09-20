import * as THREE from "three"

type Options = {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  spawn: THREE.Vector3
  isWalkable: (x: number, z: number) => boolean
  onSelectStart: (ray: THREE.Ray) => boolean
  onSelectEnd: (ray: THREE.Ray) => boolean
}

const snapTurnAngle = THREE.MathUtils.degToRad(30)
const walkSpeed = 1.6
const walkDeadZone = 0.15
const rayLength = 6
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
    marker: THREE.Mesh
    holding: boolean
    onStart: () => void
    onEnd: () => void
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

  for (const index of [0, 1]) {
    const controller = renderer.xr.getController(index)
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(),
        new THREE.Vector3(0, 0, -rayLength),
      ]),
      new THREE.LineBasicMaterial({ color: "#476B51" })
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
      marker,
      holding: false,
      onStart() {
        setRayFrom(controller)
        state.holding = onSelectStart(raycaster.ray)
      },
      onEnd() {
        setRayFrom(controller)
        if (state.holding) {
          onSelectEnd(raycaster.ray)
          state.holding = false
          return
        }
        const target = walkableFloorHit(controller)
        if (target) teleportTo(target)
      },
    }
    controller.addEventListener("selectstart", state.onStart)
    controller.addEventListener("selectend", state.onEnd)
    controllers.push(state)
  }

  function moveToSpawn() {
    rig.position.copy(spawn)
    rig.rotation.set(0, 0, 0)
  }
  function resetRig() {
    rig.position.set(0, 0, 0)
    rig.rotation.set(0, 0, 0)
    for (const state of controllers) state.marker.visible = false
  }
  renderer.xr.addEventListener("sessionstart", moveToSpawn)
  renderer.xr.addEventListener("sessionend", resetRig)

  let turnArmed = true
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

    for (const state of controllers) {
      const target = state.holding ? null : walkableFloorHit(state.controller)
      state.marker.visible = target !== null
      if (target) state.marker.position.set(target.x, 0.01, target.z)
    }

    for (const source of session.inputSources) {
      if (!source.gamepad) continue
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
    for (const state of controllers) {
      state.controller.removeEventListener("selectstart", state.onStart)
      state.controller.removeEventListener("selectend", state.onEnd)
      state.marker.geometry.dispose()
      ;(state.marker.material as THREE.Material).dispose()
      scene.remove(state.marker)
    }
    rig.remove(camera)
    scene.remove(rig)
  }

  return { rig, update, dispose }
}
