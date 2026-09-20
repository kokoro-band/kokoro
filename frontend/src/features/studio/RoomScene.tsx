import { useEffect, useRef } from "react"
import * as THREE from "three"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import { VRButton } from "three/addons/webxr/VRButton.js"

import { catalog } from "./data"
import {
  instantiateFurnitureModel,
  loadFurnitureModel,
} from "./furniture-models"
import {
  animateDoors,
  buildRoomGroup,
  createWalkableTest,
  roomSpawnPoint,
  type DoorState,
} from "./room-geometry"
import type { CatalogItem, Furniture, RoomModel, ViewMode } from "./types"
import { createVrLocomotion } from "./vr-locomotion"

type Bounds = { width: number; depth: number }

const defaultBounds: Bounds = { width: 5.8, depth: 4.2 }

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
  onSelect: (id: string | null) => void
  onMove: (id: string, x: number, z: number) => void
  onMoveEnd: () => void
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
  group.add(makeFallbackModel(item, catalogItem))
  group.userData.furnitureId = item.id
  group.position.set(
    (item.x / 100 - 0.5) * bounds.width,
    0,
    (item.z / 100 - 0.5) * bounds.depth
  )
  group.rotation.y = THREE.MathUtils.degToRad(item.rotation)
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
  room,
  onSelect,
  onMove,
  onMoveEnd,
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
      renderer.shadowMap.type = THREE.PCFSoftShadowMap
      renderer.xr.enabled = mode === "vr"
      renderer.setClearColor("#EDF0EB", 1)
      host.appendChild(renderer.domElement)

      const bounds: Bounds = room?.bounds ?? defaultBounds
      const scale = Math.max(bounds.width, bounds.depth) / defaultBounds.width

      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100 * scale)
      camera.position.set(
        mode === "2d" ? 0 : 7 * scale,
        mode === "2d" ? 12 * scale : 7.5 * scale,
        mode === "2d" ? 0.01 : 8 * scale
      )
      const controls = new OrbitControls(camera, renderer.domElement)
      controls.target.set(0, 0.25, 0)
      controls.enableDamping = true
      controls.maxPolarAngle = Math.PI / 2.15
      controls.minDistance = 4 * scale
      controls.maxDistance = 16 * scale
      controls.enableRotate = mode !== "2d"
      controls.update()

      const ambient = new THREE.HemisphereLight("#FFFFFF", "#BBB9AD", 2.4)
      scene.add(ambient)
      const sun = new THREE.DirectionalLight("#FFF3DC", 3)
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
        addBox(roomGroup, [5.8, 0.12, 4.2], [0, -0.06, 0], "#D8CAB5")
        if (mode !== "2d") {
          addBox(roomGroup, [5.8, 2.4, 0.1], [0, 1.2, -2.15], "#F8F7F2")
          addBox(roomGroup, [0.1, 2.4, 4.2], [-2.95, 1.2, 0], "#EDECE5")
          addBox(roomGroup, [2.4, 1.25, 0.025], [0.8, 1.5, -2.09], "#BED4D9")
          addBox(roomGroup, [0.06, 1.3, 0.04], [0.8, 1.5, -2.06], "#FFFFFF")
          addBox(roomGroup, [2.5, 0.06, 0.04], [0.8, 1.5, -2.05], "#FFFFFF")
        }
        const grid = new THREE.GridHelper(5.8, 29, "#B4A58F", "#C3B59F")
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
          furnitureMoved = true
          onMove(
            draggingId,
            THREE.MathUtils.clamp(
              (hitPoint.x / bounds.width + 0.5) * 100,
              7,
              93
            ),
            THREE.MathUtils.clamp(
              (hitPoint.z / bounds.depth + 0.5) * 100,
              8,
              92
            )
          )
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
        if (ray.intersectPlane(floorPlane, hitPoint)) {
          onMove(
            xrSelectedId,
            THREE.MathUtils.clamp(
              (hitPoint.x / bounds.width + 0.5) * 100,
              7,
              93
            ),
            THREE.MathUtils.clamp(
              (hitPoint.z / bounds.depth + 0.5) * 100,
              8,
              92
            )
          )
          onMoveEnd()
        }
        xrSelectedId = null
        return true
      }
      if (mode === "vr") {
        vrButton = VRButton.createButton(renderer)
        vrButton.classList.add("xr-entry")
        host.appendChild(vrButton)
        locomotion = createVrLocomotion({
          renderer,
          scene,
          camera,
          spawn: room ? roomSpawnPoint(room) : new THREE.Vector3(),
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
        vrButton?.remove()
        runtimeRef.current = null
      }
    },
    [mode, room, onMove, onMoveEnd, onSelect]
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
          outline = new THREE.BoxHelper(group, "#3D7351")
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
    [furniture, selectedId, mode, room]
  )

  return (
    <div
      ref={hostRef}
      className="room-renderer"
      aria-label="가구를 드래그할 수 있는 3D 방 편집기"
    />
  )
}
