import * as THREE from "three"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { createVrLocomotion, type VrHand } from "./vr-locomotion"

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  vi.restoreAllMocks()
})

function setup() {
  vi.spyOn(THREE.Clock.prototype, "getDelta").mockReturnValue(0.1)
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera()
  camera.position.set(0, 1.6, 0)
  type ControllerEvents = THREE.Object3DEventMap &
    Record<string, { data?: unknown }>
  const controllers = [
    new THREE.Group<ControllerEvents>(),
    new THREE.Group<ControllerEvents>(),
  ]
  for (const controller of controllers) {
    controller.position.set(0, 1, 0)
    controller.rotation.x = -Math.PI / 4
  }
  const sources: { handedness: string; gamepad?: { axes: number[] } }[] = []
  let presenting = false
  const events = new EventTarget()
  const xr = {
    getController: (index: number) => controllers[index],
    getSession: () => (presenting ? { inputSources: sources } : null),
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  }
  const walkable = vi.fn(() => true)
  const selectStart = vi.fn((_ray: THREE.Ray, _hand: VrHand) => false)
  const selectEnd = vi.fn(() => false)
  const hold = vi.fn((_hand: VrHand, _deltaSeconds: number) => {})
  const cancel = vi.fn()
  const options = {
    renderer: { xr } as unknown as THREE.WebGLRenderer,
    scene,
    camera,
    spawn: new THREE.Vector3(2, 0, 3),
    isWalkable: walkable,
    onSelectStart: selectStart,
    onSelectEnd: selectEnd,
    onHold: hold,
    onCancel: cancel,
  }
  const locomotion = createVrLocomotion(options)
  let disposed = false
  const dispose = () => {
    if (disposed) return
    disposed = true
    locomotion.dispose()
  }
  cleanups.push(dispose)
  const update = () => {
    scene.updateMatrixWorld(true)
    locomotion.update()
  }
  const session = (active: boolean) => {
    presenting = active
    events.dispatchEvent(new Event(active ? "sessionstart" : "sessionend"))
    scene.updateMatrixWorld(true)
  }
  const input = (index: number, type: string) => {
    scene.updateMatrixWorld(true)
    controllers[index].dispatchEvent({ type })
  }
  const markers = scene.children.filter((child) => child instanceof THREE.Mesh)
  return {
    ...locomotion,
    options,
    dispose,
    scene,
    camera,
    controllers,
    markers,
    sources,
    update,
    session,
    input,
    walkable,
    selectStart,
    selectEnd,
    hold,
    cancel,
  }
}

type Source = {
  handedness: string
  gamepad: {
    axes: number[]
    hapticActuators: { pulse: ReturnType<typeof vi.fn> }[]
  }
}

/** Connects a controller with its XR input source, as the browser does. */
function connect(app: ReturnType<typeof setup>, index: number, axes: number[]) {
  const source: Source = {
    handedness: index === 0 ? "left" : "right",
    gamepad: { axes, hapticActuators: [{ pulse: vi.fn() }] },
  }
  app.sources.push(source)
  app.controllers[index].dispatchEvent({ type: "connected", data: source })
  return source
}

describe("VR movement and input lifecycle", () => {
  it("starts at the spawn and resets the camera rig and markers on exit", () => {
    const app = setup()
    app.session(true)
    expect(app.rig.position.toArray()).toEqual([2, 0, 3])
    app.update()
    expect(app.markers.every((marker) => marker.visible)).toBe(true)
    app.session(false)
    expect(app.rig.position.toArray()).toEqual([0, 0, 0])
    expect(app.markers.every((marker) => !marker.visible)).toBe(true)
  })

  it("does not move without a session or inside the walking dead zone", () => {
    const app = setup()
    app.sources.push({ handedness: "left", gamepad: { axes: [0, 0, 0, -1] } })
    app.update()
    expect(app.rig.position.length()).toBe(0)
    app.session(true)
    app.sources[0].gamepad!.axes[3] = -0.1
    app.update()
    expect(app.rig.position.toArray()).toEqual([2, 0, 3])
  })

  it("walks in the head direction and leaves the rig unchanged on a blocked step", () => {
    const app = setup()
    app.sources.push({ handedness: "left", gamepad: { axes: [0, 0, 0, -1] } })
    app.session(true)
    app.update()
    expect(app.rig.position.z).toBeCloseTo(2.84)
    const before = app.rig.position.clone()
    app.walkable.mockReturnValue(false)
    app.update()
    expect(app.rig.position.equals(before)).toBe(true)
  })

  it("follows a turned head instead of a fixed world forward axis", () => {
    const app = setup()
    app.sources.push({ handedness: "left", gamepad: { axes: [0, 0, 0, -1] } })
    app.camera.rotation.y = Math.PI / 2
    app.session(true)
    app.update()
    expect(app.rig.position.x).toBeCloseTo(1.84)
    expect(app.rig.position.z).toBeCloseTo(3)
  })

  it("turns once per stick press and keeps the head at the same world position", () => {
    const app = setup()
    const axes = [0, 0, 0.8, 0]
    app.sources.push({ handedness: "right", gamepad: { axes } })
    app.camera.position.x = 0.3
    app.session(true)
    const head = app.camera.getWorldPosition(new THREE.Vector3())
    app.update()
    expect(app.rig.rotation.y).toBeCloseTo(-Math.PI / 6)
    expect(
      app.camera.getWorldPosition(new THREE.Vector3()).distanceTo(head)
    ).toBeLessThan(1e-8)
    app.update()
    expect(app.rig.rotation.y).toBeCloseTo(-Math.PI / 6)
    axes[2] = 0
    app.update()
    axes[2] = -0.8
    app.update()
    expect(app.rig.rotation.y).toBeCloseTo(0)
  })

  it("re-arms turning on the next session even if the previous stick never centered", () => {
    const app = setup()
    app.sources.push({ handedness: "right", gamepad: { axes: [0, 0, 0.8, 0] } })
    app.session(true)
    app.update()
    app.session(false)
    app.session(true)
    app.update()
    expect(app.rig.rotation.y).toBeCloseTo(-Math.PI / 6)
  })

  it("consumes grabbed furniture release without teleporting even if placement is rejected", () => {
    const app = setup()
    app.session(true)
    app.selectStart.mockReturnValue(true)
    app.input(0, "selectstart")
    app.update()
    expect(app.markers[0].visible).toBe(false)
    app.input(0, "select")
    app.input(0, "selectend")
    expect(app.selectEnd).toHaveBeenCalledTimes(1)
    expect(app.rig.position.toArray()).toEqual([2, 0, 3])
  })

  it("teleports to a valid floor target but never to a blocked target", () => {
    const app = setup()
    app.session(true)
    app.input(0, "selectstart")
    app.input(0, "selectend")
    expect(app.rig.position.z).toBeCloseTo(2)
    expect(app.selectEnd).not.toHaveBeenCalled()
    app.walkable.mockReturnValue(false)
    app.input(0, "selectstart")
    app.input(0, "selectend")
    expect(app.rig.position.z).toBeCloseTo(2)
  })

  it("discards a held selection when a session ends before selectend", () => {
    const app = setup()
    app.session(true)
    app.selectStart.mockReturnValue(true)
    app.input(0, "selectstart")
    app.session(false)
    app.session(true)
    app.update()
    expect(app.markers[0].visible).toBe(true)
    app.input(0, "selectend")
    expect(app.selectEnd).not.toHaveBeenCalled()
    expect(app.rig.position.toArray()).toEqual([2, 0, 3])
  })

  it.each(["before", "after"])(
    "recovers when controllers reconnect %s sessionstart",
    (order) => {
      const app = setup()
      app.session(true)
      app.selectStart.mockReturnValue(true)
      app.input(0, "selectstart")
      app.input(0, "disconnected")
      app.input(1, "disconnected")
      app.session(false)
      if (order === "before") app.input(0, "connected")
      app.session(true)
      if (order === "after") app.input(0, "connected")
      app.update()
      expect(app.markers[0].visible).toBe(true)
      expect(app.markers[1].visible).toBe(false)
      app.input(0, "selectstart")
      app.input(0, "select")
      app.input(0, "selectend")
      expect(app.selectEnd).toHaveBeenCalledOnce()
    }
  )

  it("does not turn again when the other controller disconnects while the stick stays tilted", () => {
    const app = setup()
    app.sources.push({ handedness: "right", gamepad: { axes: [0, 0, 0.8, 0] } })
    app.session(true)
    app.update()
    app.input(0, "disconnected")
    app.update()
    expect(app.rig.rotation.y).toBeCloseTo(-Math.PI / 6)
  })

  it("clears the held selection on controller disconnection", () => {
    const app = setup()
    app.session(true)
    app.selectStart.mockReturnValue(true)
    app.input(0, "selectstart")
    app.input(0, "disconnected")
    app.input(0, "selectend")
    expect(app.selectEnd).not.toHaveBeenCalled()
    expect(app.rig.position.toArray()).toEqual([2, 0, 3])
    app.update()
    expect(app.markers[0].visible).toBe(false)
    app.input(0, "connected")
    app.update()
    expect(app.markers[0].visible).toBe(true)
  })

  it("ignores selection events outside a session", () => {
    const app = setup()
    app.input(0, "selectstart")
    app.input(0, "selectend")
    expect(app.selectStart).not.toHaveBeenCalled()
    expect(app.rig.position.length()).toBe(0)
  })

  it("restores the desktop camera pose after XR changes it", () => {
    const app = setup()
    app.camera.position.set(4, 5, 6)
    app.camera.rotation.set(-0.5, 0.4, 0.1)
    const position = app.camera.position.clone()
    const rotation = app.camera.quaternion.clone()
    app.session(true)
    app.camera.position.set(0.2, 1.7, -0.3)
    app.camera.rotation.set(0.2, -1, 0)
    app.session(false)
    expect(app.camera.position.equals(position)).toBe(true)
    expect(app.camera.quaternion.angleTo(rotation)).toBeLessThan(1e-7)
  })

  it("grabs with the grip and releases without teleporting", () => {
    const app = setup()
    app.session(true)
    app.selectStart.mockReturnValue(true)
    app.input(0, "squeezestart")
    expect(app.selectStart).toHaveBeenCalledOnce()
    app.input(0, "squeeze")
    app.input(0, "squeezeend")
    expect(app.selectEnd).toHaveBeenCalledOnce()
    expect(app.rig.position.toArray()).toEqual([2, 0, 3])
  })

  it("never teleports from the grip when nothing was grabbed", () => {
    const app = setup()
    app.session(true)
    app.input(0, "squeezestart")
    app.input(0, "squeezeend")
    expect(app.selectEnd).not.toHaveBeenCalled()
    expect(app.rig.position.toArray()).toEqual([2, 0, 3])
  })

  it("reports the held hand every frame and keeps its stick for the furniture", () => {
    const app = setup()
    app.session(true)
    const source = connect(app, 1, [0, 0, 0.9, 0])
    app.selectStart.mockReturnValue(true)
    app.input(1, "selectstart")
    app.update()
    expect(app.hold).toHaveBeenCalledOnce()
    const [hand, deltaSeconds] = app.hold.mock.calls[0]
    expect(hand.stickX).toBeCloseTo(0.9)
    expect(hand.ray.direction.length()).toBeCloseTo(1)
    expect(deltaSeconds).toBeCloseTo(0.1)
    // The right stick turns the furniture, not the player.
    expect(app.rig.rotation.y).toBe(0)
    app.input(1, "select")
    app.input(1, "selectend")
    app.update()
    expect(app.hold).toHaveBeenCalledOnce()
    // Still tilted after letting go: wait for the centre before turning.
    expect(app.rig.rotation.y).toBe(0)
    source.gamepad.axes[2] = 0
    app.update()
    source.gamepad.axes[2] = 0.9
    app.update()
    expect(app.rig.rotation.y).toBeCloseTo(-Math.PI / 6)
  })

  it("still walks with the other hand while holding", () => {
    const app = setup()
    app.session(true)
    connect(app, 0, [0, 0, 0, -1])
    connect(app, 1, [0, 0, 0, 0])
    app.selectStart.mockReturnValue(true)
    app.input(1, "selectstart")
    app.update()
    expect(app.rig.position.z).toBeLessThan(3)
  })

  it("lets only one hand hold at a time", () => {
    const app = setup()
    app.session(true)
    app.selectStart.mockReturnValue(true)
    app.input(0, "selectstart")
    app.input(1, "squeezestart")
    expect(app.selectStart).toHaveBeenCalledOnce()
    app.input(1, "squeezeend")
    expect(app.selectEnd).not.toHaveBeenCalled()
  })

  it("pulses the holding controller", () => {
    const app = setup()
    app.session(true)
    const source = connect(app, 1, [0, 0, 0, 0])
    app.selectStart.mockImplementation((_ray: THREE.Ray, hand: VrHand) => {
      hand.pulse(0.5, 40)
      return true
    })
    app.input(1, "selectstart")
    expect(source.gamepad.hapticActuators[0].pulse).toHaveBeenCalledWith(
      0.5,
      40
    )
  })

  it.each([
    ["the session ends", (app: ReturnType<typeof setup>) => app.session(false)],
    [
      "the controller disconnects",
      (app: ReturnType<typeof setup>) => app.input(0, "disconnected"),
    ],
  ])("cancels the held furniture when %s", (_, interrupt) => {
    const app = setup()
    app.session(true)
    app.selectStart.mockReturnValue(true)
    app.input(0, "squeezestart")
    interrupt(app)
    expect(app.cancel).toHaveBeenCalledOnce()
    expect(app.selectEnd).not.toHaveBeenCalled()
  })

  it.each([
    ["selectstart", "selectend"],
    ["squeezestart", "squeezeend"],
  ])(
    "cancels instead of placing when %s ends without completing",
    (start, end) => {
      // Browsers end a press without its select/squeeze event when the
      // controller is lost mid-press; that is a cancel, not a placement.
      const app = setup()
      app.session(true)
      app.selectStart.mockReturnValue(true)
      app.input(0, start)
      app.input(0, end)
      expect(app.selectEnd).not.toHaveBeenCalled()
      expect(app.cancel).toHaveBeenCalledOnce()
      expect(app.rig.position.toArray()).toEqual([2, 0, 3])
    }
  )

  it("does not cancel when nothing is held", () => {
    const app = setup()
    app.session(true)
    app.input(0, "selectstart")
    app.session(false)
    app.dispose()
    expect(app.cancel).not.toHaveBeenCalled()
  })

  it("removes listeners and all owned controller visuals when disposed and remounted", () => {
    const app = setup()
    const line = app.controllers[0].children[0] as THREE.Line
    const disposeGeometry = vi.spyOn(line.geometry, "dispose")
    const disposeMaterial = vi.spyOn(line.material as THREE.Material, "dispose")
    app.dispose()
    expect(disposeGeometry).toHaveBeenCalledOnce()
    expect(disposeMaterial).toHaveBeenCalledOnce()
    expect(
      app.controllers.every(
        (controller) =>
          controller.children.length === 0 && controller.parent === null
      )
    ).toBe(true)
    expect(app.scene.children).toHaveLength(0)
    expect(app.camera.parent).toBeNull()
    app.input(0, "selectstart")
    expect(app.selectStart).not.toHaveBeenCalled()
    app.session(true)
    expect(app.rig.position.toArray()).toEqual([0, 0, 0])
    const remounted = createVrLocomotion(app.options)
    try {
      expect(
        app.controllers.every((controller) => controller.children.length === 1)
      ).toBe(true)
    } finally {
      remounted.dispose()
    }
  })
})
