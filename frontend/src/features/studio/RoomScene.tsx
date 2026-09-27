import { useEffect, useRef, type RefObject } from "react"
import * as THREE from "three"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import { VRButton } from "three/addons/webxr/VRButton.js"

import { catalog } from "./data"
import { roomCenter } from "./house-navigation"
import {
  instantiateFurnitureModel,
  loadFurnitureModel,
} from "./furniture-models"
import {
  animateDoors,
  setManualDoorStates,
  buildRoomGroup,
  createWalkableTest,
  roomSpawnPoint,
  type DoorState,
} from "./room-geometry"
import type {
  CatalogItem,
  Furniture,
  RoomLabel,
  RoomModel,
  ViewMode,
} from "./types"
import { localizeVrEntry } from "./vr-entry"
import { createVrLocomotion } from "./vr-locomotion"
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
  doorStates: Record<string, boolean>
  onDoorChange: (id: string, open: boolean) => void
  /** VR 진입 버튼을 넣을 DOM 위치. 없으면 렌더러 위에 둡니다. */
  xrEntryContainer?: RefObject<HTMLElement | null>
}

function addBox(
  group: THREE.Group,
  size: [number, number, number],
  position: [number, number, number],
  color: string
) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(...size),
    new THREE.MeshStandardMaterial({ color, roughness: 0.8 })
  )
  mesh.position.set(...position)
  mesh.castShadow = true
  mesh.receiveShadow = true
  group.add(mesh)
  return mesh
}

function makeFallbackModel(item: Furniture, catalogItem?: CatalogItem) {
  const group = new THREE.Group()
  const width = catalogItem?.width ?? 0.6
  const depth = catalogItem?.depth ?? 0.6

  if (item.category === "소파") {
    addBox(group, [width, 0.35, depth], [0, 0.38, 0], item.color)
    addBox(group, [width, 0.5, 0.18], [0, 0.73, depth / 2 - 0.08], item.color)
    addBox(group, [0.15, 0.5, depth], [-width / 2 + 0.07, 0.6, 0], item.color)
    addBox(group, [0.15, 0.5, depth], [width / 2 - 0.07, 0.6, 0], item.color)
    for (const x of [-width / 2 + 0.15, width / 2 - 0.15]) {
      for (const z of [-depth / 2 + 0.12, depth / 2 - 0.12])
        addBox(group, [0.06, 0.22, 0.06], [x, 0.11, z], "#55463B")
    }
  } else if (item.category === "테이블") {
    if (item.catalogId === "table-white") {
      const top = new THREE.Mesh(
        new THREE.CylinderGeometry(width / 2, width / 2, 0.08, 40),
        new THREE.MeshStandardMaterial({ color: item.color })
      )
      top.position.y = 0.6
      top.castShadow = true
      group.add(top)
      addBox(group, [0.15, 0.55, 0.15], [0, 0.28, 0], "#C3B9AC")
    } else {
      addBox(group, [width, 0.08, depth], [0, 0.48, 0], item.color)
      for (const x of [-width / 2 + 0.12, width / 2 - 0.12]) {
        for (const z of [-depth / 2 + 0.1, depth / 2 - 0.1])
          addBox(group, [0.06, 0.46, 0.06], [x, 0.23, z], "#8D633E")
      }
    }
  } else if (item.category === "의자") {
    addBox(group, [width, 0.12, depth], [0, 0.48, 0], item.color)
    addBox(group, [width, 0.55, 0.12], [0, 0.78, depth / 2 - 0.06], item.color)
    for (const x of [-0.24, 0.24]) {
      for (const z of [-0.23, 0.23])
        addBox(group, [0.045, 0.45, 0.045], [x, 0.23, z], "#53493E")
    }
  } else if (item.catalogId === "lamp-arc") {
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.22, 0.05, 24),
      new THREE.MeshStandardMaterial({ color: "#57534D" })
    )
    base.position.y = 0.03
    group.add(base)
    addBox(group, [0.035, 1.45, 0.035], [0, 0.74, 0], "#57534D")
    const shade = new THREE.Mesh(
      new THREE.ConeGeometry(0.28, 0.3, 32, 1, true),
      new THREE.MeshStandardMaterial({
        color: item.color,
        side: THREE.DoubleSide,
      })
    )
    shade.position.y = 1.48
    group.add(shade)
  } else {
    const pot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.15, 0.35, 24),
      new THREE.MeshStandardMaterial({ color: "#C1AD94" })
    )
    pot.position.y = 0.18
    pot.castShadow = true
    group.add(pot)
    addBox(group, [0.04, 0.75, 0.04], [0, 0.65, 0], "#756348")
    for (const [x, y, z, radius] of [
      [0, 1.05, 0, 0.3],
      [-0.18, 0.8, 0.08, 0.23],
      [0.18, 0.85, -0.08, 0.23],
    ]) {
      const leaves = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 16, 12),
        new THREE.MeshStandardMaterial({ color: item.color, roughness: 1 })
      )
      leaves.position.set(x, y, z)
      leaves.scale.y = 1.25
      leaves.castShadow = true
      group.add(leaves)
    }
  }

  return group
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
  group.position.set(item.x - bounds.width / 2, 0, item.z - bounds.depth / 2)
  // Stored positive angles use the same X/Z axes as the placement validator.
  group.rotation.y = -THREE.MathUtils.degToRad(item.rotation)
  return { group, catalogItem }
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
  doorStates,
  onDoorChange,
  xrEntryContainer,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const runtimeRef = useRef<SceneRuntime | null>(null)

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
        roomGroup = buildRoomGroup(room, mode)
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
      runtimeRef.current = {
        renderer,
        scene,
        furnitureGroup,
        bounds,
        interaction,
        doors,
      }

      let vrButton: HTMLElement | null = null
      let stopLocalizingVrEntry: (() => void) | null = null
      let locomotion: ReturnType<typeof createVrLocomotion> | null = null
      let xrSelectedId: string | null = null
      function grabInVr(ray: THREE.Ray) {
        raycaster.ray.copy(ray)
        const hit = pickScene()
        if (hit?.kind === "door") {
          toggleDoor(hit.id)
          xrSelectedId = null
          return true
        }
        xrSelectedId = hit?.id ?? null
        if (xrSelectedId) onSelect(xrSelectedId)
        return xrSelectedId !== null
      }
      function placeInVr(ray: THREE.Ray) {
        if (!xrSelectedId) return false
        if (
          ray.intersectPlane(floorPlane, hitPoint) &&
          onMove(
            xrSelectedId,
            hitPoint.x + bounds.width / 2,
            hitPoint.z + bounds.depth / 2,
            focusRoom
          )
        ) {
          onMoveEnd()
        }
        xrSelectedId = null
        return true
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
        renderer.render(scene, camera)
      })

      return function disposeRoomRenderer() {
        observer.disconnect()
        renderer.setAnimationLoop(null)
        interaction?.dispose()
        locomotion?.dispose()
        controls.dispose()
        disposeGroup(roomGroup)
        disposeGroup(furnitureGroup)
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
      onSelect,
      onDoorChange,
      xrEntryContainer,
    ]
  )

  useEffect(
    function synchronizeFurnitureModels() {
      const runtime = runtimeRef.current
      if (!runtime) return
      disposeGroup(runtime.furnitureGroup)
      runtime.furnitureGroup.clear()
      furniture.forEach((item) => {
        const { group, catalogItem } = makeFurnitureModel(item, runtime.bounds)
        let outline: THREE.BoxHelper | null = null
        if (item.id === selectedId) {
          outline = new THREE.BoxHelper(group, sceneColors.selection)
          runtime.furnitureGroup.add(outline)
        }
        runtime.furnitureGroup.add(group)

        if (!catalogItem?.modelUrl) return
        loadFurnitureModel(catalogItem.modelUrl)
          .then((template) => {
            if (group.parent !== runtime.furnitureGroup) return
            const fallback = group.children[0] as THREE.Group | undefined
            if (fallback) {
              disposeGroup(fallback)
              group.remove(fallback)
            }
            group.add(instantiateFurnitureModel(template, catalogItem))
            outline?.update()
          })
          .catch(() => {})
      })
    },
    [
      furniture,
      selectedId,
      mode,
      room,
      focusRoom,
      onMove,
      onMoveEnd,
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
