import { useEffect, useRef, type RefObject } from "react"
import * as THREE from "three"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import { VRButton } from "three/addons/webxr/VRButton.js"

import { catalog } from "./data"
import { containsPoint, roomCenter } from "./house-navigation"
import { upgradeFurnitureModel } from "./furniture-models"
import { addBox, makeFallbackModel } from "./furniture-fallback"
import {
  isInsideRoom,
  animateDoors,
  buildRoomGroup,
  createWalkableTest,
  roomSpawnPoint,
  type DoorState,
} from "./room-geometry"
import type { Furniture, RoomLabel, RoomModel, ViewMode } from "./types"
import { localizeVrEntry } from "./vr-entry"
import { createVrLocomotion } from "./vr-locomotion"

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
}

type Props = {
  furniture: Furniture[]
  selectedId: string | null
  mode: ViewMode
  room?: RoomModel
  focusRoom?: RoomLabel | null
  onSelect: (id: string | null) => void
  onMove: (id: string, x: number, z: number) => void
  onMoveEnd: () => void
  /** VR 진입 버튼을 넣을 DOM 위치. 없으면 렌더러 위에 둡니다. */
  xrEntryContainer?: RefObject<HTMLElement | null>
}

function makeFurnitureModel(item: Furniture, bounds: Bounds) {
  const group = new THREE.Group()
  const catalogItem = catalog.find((entry) => entry.id === item.catalogId)
  group.add(makeFallbackModel(item, catalogItem))
  group.userData.furnitureId = item.id
  group.position.set(item.x - bounds.width / 2, 0, item.z - bounds.depth / 2)
  group.rotation.y = THREE.MathUtils.degToRad(item.rotation)
  return { group, catalogItem }
}

function placementAt(
  point: THREE.Vector3,
  bounds: Bounds,
  room?: RoomModel,
  focusRoom?: RoomLabel | null
): [x: number, z: number] | null {
  const margin = 0.2
  const worldX = THREE.MathUtils.clamp(
    point.x,
    margin - bounds.width / 2,
    bounds.width / 2 - margin
  )
  const worldZ = THREE.MathUtils.clamp(
    point.z,
    margin - bounds.depth / 2,
    bounds.depth / 2 - margin
  )
  if (room && !isInsideRoom(room, worldX, worldZ)) return null
  const x = round(worldX + bounds.width / 2)
  const z = round(worldZ + bounds.depth / 2)
  if (focusRoom && !containsPoint(focusRoom.polygon, x, z)) return null
  return [x, z]
}

function round(value: number) {
  return Math.round(value * 100) / 100
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
  room,
  focusRoom,
  onSelect,
  onMove,
  onMoveEnd,
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
      controls.enableDamping = true
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

      const furnitureGroup = new THREE.Group()
      scene.add(furnitureGroup)
      runtimeRef.current = { renderer, scene, furnitureGroup, bounds }

      const raycaster = new THREE.Raycaster()
      const pointer = new THREE.Vector2()
      const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
      const hitPoint = new THREE.Vector3()
      let draggingId: string | null = null
      let furnitureMoved = false

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

      function selectFurniture(event: PointerEvent) {
        if (event.button !== 0) return
        setPointerRay(event)
        const hit = raycaster.intersectObjects(furnitureGroup.children, true)[0]
        const id = hit ? identifyFurniture(hit.object) : null
        if (id) {
          draggingId = id
          furnitureMoved = false
          controls.enabled = false
          onSelect(id)
          renderer.domElement.setPointerCapture(event.pointerId)
        }
      }

      function moveFurniture(event: PointerEvent) {
        if (!draggingId) return
        setPointerRay(event)
        if (raycaster.ray.intersectPlane(floorPlane, hitPoint)) {
          const placement = placementAt(hitPoint, bounds, room, focusRoom)
          if (!placement) return
          furnitureMoved = true
          onMove(draggingId, ...placement)
        }
      }

      function releaseFurniture() {
        if (draggingId && furnitureMoved) onMoveEnd()
        draggingId = null
        furnitureMoved = false
        controls.enabled = true
      }

      renderer.domElement.addEventListener("pointerdown", selectFurniture)
      renderer.domElement.addEventListener("pointermove", moveFurniture)
      renderer.domElement.addEventListener("pointerup", releaseFurniture)
      renderer.domElement.addEventListener("pointercancel", releaseFurniture)

      let vrButton: HTMLElement | null = null
      let stopLocalizingVrEntry: (() => void) | null = null
      let locomotion: ReturnType<typeof createVrLocomotion> | null = null
      let xrSelectedId: string | null = null
      function grabInVr(ray: THREE.Ray) {
        raycaster.ray.copy(ray)
        const hit = raycaster.intersectObjects(furnitureGroup.children, true)[0]
        xrSelectedId = hit ? identifyFurniture(hit.object) : null
        if (xrSelectedId) onSelect(xrSelectedId)
        return xrSelectedId !== null
      }
      function placeInVr(ray: THREE.Ray) {
        if (!xrSelectedId) return false
        const placement = ray.intersectPlane(floorPlane, hitPoint)
          ? placementAt(hitPoint, bounds, room, focusRoom)
          : null
        if (placement) {
          onMove(xrSelectedId, ...placement)
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
            ? createWalkableTest(room)
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
      const doors = (roomGroup.userData.doors as DoorState[] | undefined) ?? []
      renderer.setAnimationLoop(function renderRoomFrame() {
        const deltaSeconds = Math.min(doorClock.getDelta(), 0.1)
        if (renderer.xr.isPresenting) {
          locomotion?.update()
          camera.getWorldPosition(headPosition)
          animateDoors(doors, headPosition, deltaSeconds)
        } else {
          controls.update()
        }
        renderer.render(scene, camera)
      })

      return function disposeRoomRenderer() {
        observer.disconnect()
        renderer.setAnimationLoop(null)
        renderer.domElement.removeEventListener("pointerdown", selectFurniture)
        renderer.domElement.removeEventListener("pointermove", moveFurniture)
        renderer.domElement.removeEventListener("pointerup", releaseFurniture)
        renderer.domElement.removeEventListener(
          "pointercancel",
          releaseFurniture
        )
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
    [mode, room, focusRoom, onMove, onMoveEnd, onSelect, xrEntryContainer]
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

        if (!catalogItem) return
        void upgradeFurnitureModel(
          group,
          catalogItem,
          () => group.parent === runtime.furnitureGroup,
          disposeGroup,
          () => outline?.update()
        )
      })
    },
    [furniture, selectedId, mode, room, focusRoom, onMove, onMoveEnd, onSelect]
  )

  return (
    <div
      ref={hostRef}
      className="room-renderer"
      aria-label="가구를 드래그할 수 있는 3D 방 편집기"
    />
  )
}
