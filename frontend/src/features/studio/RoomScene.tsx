import { useEffect, useRef, type RefObject } from "react"
import * as THREE from "three"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import { VRButton } from "three/addons/webxr/VRButton.js"

import { catalog } from "./data"
import { roomCenter } from "./house-navigation"
import { upgradeFurnitureModel } from "./furniture-models"
import { addBox, makeFallbackModel } from "./furniture-fallback"
import {
  animateDoors,
  setManualDoorStates,
  buildRoomGroup,
  createWalkableTest,
  roomSpawnPoint,
  type DoorState,
} from "./room-geometry"
import type { Furniture, RoomLabel, RoomModel, ViewMode } from "./types"
import { localizeVrEntry } from "./vr-entry"
import { furnitureModelKey, planFurnitureSync } from "./scene-furniture-sync"
import { holdStep, startHold, type Hold } from "./vr-grab"
import { createVrLocomotion, type VrHand } from "./vr-locomotion"
import {
  bindSceneInteraction,
  type CursorTool,
  type SceneHit,
} from "./scene-interaction"

type Bounds = { width: number; depth: number }

const defaultBounds: Bounds = { width: 5.8, depth: 4.2 }

const sceneColors = {
  background: "#F2F3F6",
  ambientSky: "#FFFFFF",
  ambientGround: "#D9DCE3",
  sunlight: "#FFF8F0",
  floor: "#E4E6EB",
  wall: "#FFFFFF",
  sideWall: "#F7F8FA",
  glass: "#B8DAED",
  frame: "#FFFFFF",
  gridPrimary: "#BFC4CC",
  gridSecondary: "#D6DAE0",
  selection: "#FF6F0F",
} as const

type SceneRuntime = {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  furnitureGroup: THREE.Group
  bounds: Bounds
  interaction: ReturnType<typeof bindSceneInteraction> | null
  doors: DoorState[]
  doorHighlights: Map<string, THREE.BoxHelper>
  /** Built furniture models by id, with the key of the look they were built for. */
  models: Map<string, { group: THREE.Group; key: string }>
  outline: THREE.BoxHelper | null
}

type Props = {
  furniture: Furniture[]
  selectedId: string | null
  mode: ViewMode
  tool: CursorTool
  room?: RoomModel
  focusRoom?: RoomLabel | null
  onSelect: (id: string | null) => void
  onMove: (
    id: string,
    x: number,
    z: number,
    focus?: RoomLabel | null
  ) => boolean
  onMoveEnd: () => void
  /** Wall-limits a pose without saving it. Used every frame of a VR grab. */
  onConstrainPose: (
    item: Furniture,
    update: Partial<Pick<Furniture, "x" | "z" | "rotation">>,
    focus?: RoomLabel | null
  ) => Furniture
  /** Applies the pose of a released VR grab as a preview for onMoveEnd. */
  onPlace: (
    id: string,
    pose: Pick<Furniture, "x" | "z" | "rotation">,
    focus?: RoomLabel | null
  ) => boolean
  doorStates: Record<string, boolean>
  highlightedDoorId: string | null
  onDoorChange: (id: string, open: boolean) => void
  /** VR 진입 버튼을 넣을 DOM 위치. 없으면 렌더러 위에 둡니다. */
  xrEntryContainer?: RefObject<HTMLElement | null>
}

function setDoorHighlight(
  highlights: Map<string, THREE.BoxHelper>,
  id: string | null
) {
  for (const [doorId, helper] of highlights) helper.visible = doorId === id
}

function makeFurnitureModel(item: Furniture, bounds: Bounds) {
  const group = new THREE.Group()
  const catalogItem = catalog.find((entry) => entry.id === item.catalogId)
  const fallback = makeFallbackModel(item, catalogItem)
  if (catalogItem) {
    const box = new THREE.Box3().setFromObject(fallback)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const sx = size.x > 0 ? catalogItem.width / size.x : 1
    const sz = size.z > 0 ? catalogItem.depth / size.z : 1
    fallback.scale.set(sx, 1, sz)
    fallback.position.set(-center.x * sx, 0, -center.z * sz)
  }
  group.add(fallback)
  group.userData.furnitureId = item.id
  placeFurnitureModel(group, item, bounds)
  return { group, catalogItem }
}

function placeFurnitureModel(
  group: THREE.Group,
  item: Furniture,
  bounds: Bounds
) {
  group.position.set(item.x - bounds.width / 2, 0, item.z - bounds.depth / 2)
  // Stored positive angles use the same X/Z axes as the placement validator.
  group.rotation.y = -THREE.MathUtils.degToRad(item.rotation)
}

function disposeGroup(group: THREE.Group) {
  group.traverse((object) => {
    if (object.userData.sharedAsset) return
    if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
      object.geometry.dispose()
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material]
      materials.forEach((material) => material.dispose())
    }
  })
}

export function RoomScene({
  furniture,
  selectedId,
  mode,
  tool,
  room,
  focusRoom,
  onSelect,
  onMove,
  onMoveEnd,
  onConstrainPose,
  onPlace,
  doorStates,
  highlightedDoorId,
  onDoorChange,
  xrEntryContainer,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const runtimeRef = useRef<SceneRuntime | null>(null)
  const doorAnglesRef = useRef(new Map<string, number>())
  // A VR grab reads the saved pose without restarting the renderer.
  const furnitureRef = useRef(furniture)
  useEffect(
    function rememberFurniture() {
      furnitureRef.current = furniture
    },
    [furniture]
  )

  useEffect(
    function initializeRoomRenderer() {
      const host = hostRef.current
      if (!host) return

      let renderer: THREE.WebGLRenderer
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
      } catch {
        const errorMessage = document.createElement("p")
        errorMessage.className = "renderer-error"
        errorMessage.textContent =
          "이 브라우저에서 3D 렌더러를 시작하지 못했습니다. 다른 브라우저에서 다시 열어 주세요."
        host.replaceChildren(errorMessage)
        return
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.shadowMap.enabled = true
      renderer.shadowMap.type = THREE.PCFShadowMap
      renderer.xr.enabled = mode === "vr"
      renderer.setClearColor(sceneColors.background, 1)
      host.appendChild(renderer.domElement)

      const bounds: Bounds = room?.bounds ?? defaultBounds
      const scale = Math.max(bounds.width, bounds.depth) / defaultBounds.width
      const focusCenter = focusRoom ? roomCenter(focusRoom) : null
      const focusWidth = focusRoom
        ? Math.max(...focusRoom.polygon.map(([x]) => x)) -
          Math.min(...focusRoom.polygon.map(([x]) => x))
        : bounds.width
      const focusDepth = focusRoom
        ? Math.max(...focusRoom.polygon.map(([, z]) => z)) -
          Math.min(...focusRoom.polygon.map(([, z]) => z))
        : bounds.depth
      const focusScale = Math.max(
        0.85,
        Math.max(focusWidth, focusDepth, 2) / defaultBounds.width
      )
      const centerX = focusCenter ? focusCenter[0] - bounds.width / 2 : 0
      const centerZ = focusCenter ? focusCenter[1] - bounds.depth / 2 : 0
      const viewportFit =
        host.clientWidth <= 480 ? 1.18 : host.clientWidth <= 820 ? 1.08 : 1

      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100 * scale)
      camera.position.set(
        centerX + (mode === "2d" ? 0 : 5 * focusScale * viewportFit),
        mode === "2d"
          ? 12 * focusScale * viewportFit
          : 11 * focusScale * viewportFit,
        centerZ + (mode === "2d" ? 0.01 : 7 * focusScale * viewportFit)
      )
      const controls = new OrbitControls(camera, renderer.domElement)
      controls.target.set(centerX, 0.25, centerZ)
      // An editor must stop with the pointer. Inertia must not resume after
      // changing from furniture editing back to camera movement.
      controls.enableDamping = false
      if (mode !== "vr") {
        controls.mouseButtons.LEFT = THREE.MOUSE.PAN
        controls.mouseButtons.RIGHT =
          mode === "2d" ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE
        controls.touches.ONE = THREE.TOUCH.PAN
      }
      controls.maxPolarAngle = Math.PI / 2.15
      controls.minDistance = Math.max(2, 4 * focusScale)
      controls.maxDistance = 16 * scale
      controls.enableRotate = mode !== "2d"
      controls.update()

      const ambient = new THREE.HemisphereLight(
        sceneColors.ambientSky,
        sceneColors.ambientGround,
        2.4
      )
      scene.add(ambient)
      const sun = new THREE.DirectionalLight(sceneColors.sunlight, 3)
      sun.position.set(-3, 7, -4)
      sun.castShadow = true
      sun.shadow.mapSize.set(2048, 2048)
      sun.shadow.camera.left = -7 * scale
      sun.shadow.camera.right = 7 * scale
      sun.shadow.camera.top = 7 * scale
      sun.shadow.camera.bottom = -7 * scale
      scene.add(sun)

      let roomGroup: THREE.Group
      if (room) {
        roomGroup = buildRoomGroup(room, mode, doorAnglesRef.current)
      } else {
        roomGroup = new THREE.Group()
        addBox(roomGroup, [5.8, 0.12, 4.2], [0, -0.06, 0], sceneColors.floor)
        if (mode !== "2d") {
          addBox(roomGroup, [5.8, 2.4, 0.1], [0, 1.2, -2.15], sceneColors.wall)
          addBox(
            roomGroup,
            [0.1, 2.4, 4.2],
            [-2.95, 1.2, 0],
            sceneColors.sideWall
          )
          addBox(
            roomGroup,
            [2.4, 1.25, 0.025],
            [0.8, 1.5, -2.09],
            sceneColors.glass
          )
          addBox(
            roomGroup,
            [0.06, 1.3, 0.04],
            [0.8, 1.5, -2.06],
            sceneColors.frame
          )
          addBox(
            roomGroup,
            [2.5, 0.06, 0.04],
            [0.8, 1.5, -2.05],
            sceneColors.frame
          )
        }
        const grid = new THREE.GridHelper(
          5.8,
          29,
          sceneColors.gridPrimary,
          sceneColors.gridSecondary
        )
        grid.position.y = 0.008
        grid.scale.z = 4.2 / 5.8
        grid.material.transparent = true
        grid.material.opacity = 0.24
        roomGroup.add(grid)
      }
      scene.add(roomGroup)
      const doors = (roomGroup.userData.doors as DoorState[] | undefined) ?? []
      const doorHighlights = new Map<string, THREE.BoxHelper>()
      for (const door of doors) {
        const helper = new THREE.BoxHelper(door.local, sceneColors.selection)
        helper.material.depthTest = false
        helper.renderOrder = 10
        helper.visible = false
        scene.add(helper)
        doorHighlights.set(door.id, helper)
      }

      const furnitureGroup = new THREE.Group()
      scene.add(furnitureGroup)

      const raycaster = new THREE.Raycaster()
      const pointer = new THREE.Vector2()
      const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
      const hitPoint = new THREE.Vector3()

      function identifyFurniture(object: THREE.Object3D): string | null {
        let current: THREE.Object3D | null = object
        while (current) {
          if (current.userData.furnitureId)
            return current.userData.furnitureId as string
          current = current.parent
        }
        return null
      }

      function setPointerRay(event: PointerEvent) {
        const bounds = renderer.domElement.getBoundingClientRect()
        pointer.set(
          ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
          -((event.clientY - bounds.top) / bounds.height) * 2 + 1
        )
        raycaster.setFromCamera(pointer, camera)
      }

      function pickScene(): SceneHit | null {
        // Selection BoxHelpers are not furniture and must not mask a model hit.
        const hit = raycaster
          .intersectObjects(
            [...furnitureGroup.children, ...doors.map((door) => door.local)],
            true
          )
          .find(
            (entry) =>
              identifyFurniture(entry.object) || identifyDoor(entry.object)
          )
        const doorId = hit ? identifyDoor(hit.object) : null
        if (doorId) return { kind: "door", id: doorId }
        const id = hit ? identifyFurniture(hit.object) : null
        const model = furnitureGroup.children.find(
          (entry) => entry.userData.furnitureId === id
        )
        return id && model
          ? {
              id,
              center: [model.position.x, model.position.z] as [number, number],
            }
          : null
      }

      function identifyDoor(object: THREE.Object3D): string | null {
        let current: THREE.Object3D | null = object
        while (current) {
          if (current.userData.doorId) return current.userData.doorId as string
          current = current.parent
        }
        return null
      }

      function toggleDoor(id: string) {
        const door = doors.find((entry) => entry.id === id)
        if (door)
          onDoorChange(id, !(door.manualOpen ?? door.openTarget !== null))
      }

      function pointAt(event: PointerEvent): [number, number] | null {
        setPointerRay(event)
        return raycaster.ray.intersectPlane(floorPlane, hitPoint)
          ? [hitPoint.x, hitPoint.z]
          : null
      }

      const interaction =
        mode === "vr"
          ? null
          : bindSceneInteraction({
              element: renderer.domElement,
              // The synchronization effect below applies the current tool, including
              // when a new room renderer is mounted. Tool changes never recreate it.
              initialTool: "move",
              pick(event) {
                setPointerRay(event)
                return pickScene()
              },
              pointAt,
              onSelect,
              onToggleDoor: toggleDoor,
              onMove(id, [x, z]) {
                return onMove(
                  id,
                  x + bounds.width / 2,
                  z + bounds.depth / 2,
                  focusRoom
                )
              },
              onCommit: onMoveEnd,
              setCameraEnabled(enabled) {
                controls.enabled = enabled
              },
              resetCameraGesture() {
                controls.disconnect()
                controls.connect(renderer.domElement)
              },
            })
      const runtime: SceneRuntime = {
        renderer,
        scene,
        furnitureGroup,
        bounds,
        interaction,
        doors,
        doorHighlights,
        models: new Map(),
        outline: null,
      }
      runtimeRef.current = runtime

      let vrButton: HTMLElement | null = null
      let stopLocalizingVrEntry: (() => void) | null = null
      let locomotion: ReturnType<typeof createVrLocomotion> | null = null
      // A grab moves only the 3D model each frame, limited by the walls, and
      // saves once on release. Updating React state per frame stuttered on Quest.
      let grab: { item: Furniture; hold: Hold; changed: boolean } | null = null
      function floorPoint(ray: THREE.Ray): [number, number] | null {
        return ray.intersectPlane(floorPlane, hitPoint)
          ? [hitPoint.x, hitPoint.z]
          : null
      }
      function showPose(item: Furniture) {
        const model = runtime.models.get(item.id)
        if (!model) return
        placeFurnitureModel(model.group, item, bounds)
        if (runtime.outline?.object === model.group) runtime.outline.update()
      }
      function grabInVr(ray: THREE.Ray, hand: VrHand) {
        raycaster.ray.copy(ray)
        const hit = pickScene()
        if (hit?.kind === "door") {
          toggleDoor(hit.id)
          hand.pulse(0.25, 20)
          return true
        }
        const item = hit
          ? furnitureRef.current.find((entry) => entry.id === hit.id)
          : undefined
        if (!hit || !item) return false
        grab = {
          item,
          hold: startHold(
            item.id,
            hit.center,
            floorPoint(ray) ?? hit.center,
            item.rotation
          ),
          changed: false,
        }
        onSelect(item.id)
        hand.pulse(0.5, 40)
        return true
      }
      function holdInVr(hand: VrHand, deltaSeconds: number) {
        if (!grab) return
        const step = holdStep(
          grab.hold,
          floorPoint(hand.ray),
          hand.stickX,
          grab.item.rotation,
          deltaSeconds
        )
        grab.hold = step.held
        const update: Partial<Pick<Furniture, "x" | "z" | "rotation">> = {}
        if (step.move) {
          update.x = step.move[0] + bounds.width / 2
          update.z = step.move[1] + bounds.depth / 2
        }
        if (step.rotate !== undefined) update.rotation = step.rotate
        if (update.x === undefined && update.rotation === undefined) return
        const previous = grab.item
        const next = onConstrainPose(previous, update, focusRoom)
        if (
          next.x === previous.x &&
          next.z === previous.z &&
          next.rotation === previous.rotation
        )
          return
        grab.item = next
        grab.changed = true
        showPose(next)
        if (next.rotation !== previous.rotation) hand.pulse(0.25, 20)
      }
      function placeInVr(_ray: THREE.Ray, hand: VrHand) {
        if (!grab) return false
        const { item, changed } = grab
        grab = null
        if (changed) {
          const pose = { x: item.x, z: item.z, rotation: item.rotation }
          onPlace(item.id, pose, focusRoom)
          onMoveEnd()
        }
        hand.pulse(0.4, 30)
        return true
      }
      function cancelInVr() {
        if (!grab) return
        const saved = furnitureRef.current.find(
          (entry) => entry.id === grab?.item.id
        )
        grab = null
        if (saved) showPose(saved)
      }
      if (mode === "vr") {
        vrButton = VRButton.createButton(renderer)
        vrButton.classList.add("xr-entry")
        stopLocalizingVrEntry = localizeVrEntry(vrButton)
        ;(xrEntryContainer?.current ?? host).appendChild(vrButton)
        locomotion = createVrLocomotion({
          renderer,
          scene,
          camera,
          spawn: focusCenter
            ? new THREE.Vector3(centerX, 0, centerZ)
            : room
              ? roomSpawnPoint(room)
              : new THREE.Vector3(),
          isWalkable: room
            ? createWalkableTest(room, doors)
            : (x, z) =>
                Math.abs(x) < bounds.width / 2 &&
                Math.abs(z) < bounds.depth / 2,
          onSelectStart: grabInVr,
          onSelectEnd: placeInVr,
          onHold: holdInVr,
          onCancel: cancelInVr,
        })
      }

      const observer = new ResizeObserver(function resizeRoomRenderer() {
        const width = host.clientWidth
        const height = host.clientHeight
        renderer.setSize(width, height)
        camera.aspect = width / Math.max(height, 1)
        camera.updateProjectionMatrix()
      })
      observer.observe(host)
      const doorClock = new THREE.Clock()
      const headPosition = new THREE.Vector3()
      renderer.setAnimationLoop(function renderRoomFrame() {
        const deltaSeconds = Math.min(doorClock.getDelta(), 0.1)
        if (renderer.xr.isPresenting) {
          locomotion?.update()
          camera.getWorldPosition(headPosition)
        } else if (controls.enabled) {
          controls.update()
        }
        animateDoors(
          doors,
          renderer.xr.isPresenting ? headPosition : null,
          deltaSeconds
        )
        for (const helper of doorHighlights.values()) {
          if (helper.visible) helper.update()
        }
        renderer.render(scene, camera)
      })

      return function disposeRoomRenderer() {
        doorAnglesRef.current = new Map(
          doors.map((door) => [door.id, door.angle])
        )
        observer.disconnect()
        renderer.setAnimationLoop(null)
        interaction?.dispose()
        locomotion?.dispose()
        controls.dispose()
        disposeGroup(roomGroup)
        disposeGroup(furnitureGroup)
        for (const helper of doorHighlights.values()) {
          helper.geometry.dispose()
          helper.material.dispose()
        }
        renderer.dispose()
        renderer.domElement.remove()
        stopLocalizingVrEntry?.()
        vrButton?.remove()
        runtimeRef.current = null
      }
    },
    [
      mode,
      room,
      focusRoom,
      onMove,
      onMoveEnd,
      onConstrainPose,
      onPlace,
      onSelect,
      onDoorChange,
      xrEntryContainer,
    ]
  )

  useEffect(
    function synchronizeDoorStates() {
      setManualDoorStates(runtimeRef.current?.doors ?? [], doorStates)
    },
    [
      doorStates,
      mode,
      room,
      focusRoom,
      onMove,
      onMoveEnd,
      onConstrainPose,
      onPlace,
      onSelect,
      onDoorChange,
      xrEntryContainer,
    ]
  )

  useEffect(
    function synchronizeDoorHighlight() {
      const highlights = runtimeRef.current?.doorHighlights
      if (highlights) setDoorHighlight(highlights, highlightedDoorId)
    },
    [
      highlightedDoorId,
      mode,
      room,
      focusRoom,
      onMove,
      onMoveEnd,
      onConstrainPose,
      onPlace,
      onSelect,
      onDoorChange,
      xrEntryContainer,
    ]
  )

  useEffect(
    function synchronizeCursorTool() {
      runtimeRef.current?.interaction?.setTool(tool)
    },
    [
      tool,
      mode,
      room,
      focusRoom,
      onMove,
      onMoveEnd,
      onConstrainPose,
      onPlace,
      onSelect,
      onDoorChange,
      xrEntryContainer,
    ]
  )

  useEffect(
    function synchronizeFurnitureModels() {
      const runtime = runtimeRef.current
      if (!runtime) return
      const { models, furnitureGroup, bounds } = runtime

      function removeOutline() {
        if (!runtime?.outline) return
        furnitureGroup.remove(runtime.outline)
        runtime.outline.geometry.dispose()
        runtime.outline.material.dispose()
        runtime.outline = null
      }
      function removeModel(id: string) {
        const model = models.get(id)
        if (!model) return
        if (runtime?.outline?.object === model.group) removeOutline()
        furnitureGroup.remove(model.group)
        disposeGroup(model.group)
        models.delete(id)
      }

      // Drags and VR grabs only change poses. Rebuilding every model on each
      // frame made held furniture stutter, so unchanged models are moved.
      const plan = planFurnitureSync(
        new Map([...models].map(([id, model]) => [id, model.key])),
        furniture
      )
      plan.remove.forEach(removeModel)
      for (const item of plan.rebuild) {
        removeModel(item.id)
        const { group, catalogItem } = makeFurnitureModel(item, bounds)
        models.set(item.id, { group, key: furnitureModelKey(item) })
        furnitureGroup.add(group)
        if (!catalogItem) continue
        void upgradeFurnitureModel(
          group,
          catalogItem,
          () => group.parent === furnitureGroup,
          disposeGroup,
          () => runtime.outline?.update()
        )
      }
      for (const item of plan.place) {
        const model = models.get(item.id)
        if (model) placeFurnitureModel(model.group, item, bounds)
      }

      const selected = selectedId ? models.get(selectedId)?.group : undefined
      if (runtime.outline && runtime.outline.object !== selected)
        removeOutline()
      if (selected && !runtime.outline) {
        runtime.outline = new THREE.BoxHelper(selected, sceneColors.selection)
        furnitureGroup.add(runtime.outline)
      }
      runtime.outline?.update()
    },
    [
      furniture,
      selectedId,
      mode,
      room,
      focusRoom,
      onMove,
      onMoveEnd,
      onConstrainPose,
      onPlace,
      onSelect,
      onDoorChange,
      xrEntryContainer,
    ]
  )

  return (
    <div
      ref={hostRef}
      className="room-renderer"
      aria-label="가구를 드래그할 수 있는 3D 방 편집기"
    />
  )
}
