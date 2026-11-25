import * as THREE from "three"
import type { CatalogItem, Furniture, Point2, RoomLabel } from "./types"
import { insideRoom, overlaps, type Box } from "./placement-issues"
import { labelPoint } from "./room-builder"

/** Fit both axes in meters. Keeping camera.zoom separate preserves the user's zoom on resize. */
export function fitPlanCamera(
  camera: THREE.OrthographicCamera,
  width: number,
  depth: number,
  aspect: number
) {
  const halfHeight = Math.max(depth, width / aspect, 0.5) * 0.59
  camera.top = halfHeight
  camera.bottom = -halfHeight
  camera.left = -halfHeight * aspect
  camera.right = halfHeight * aspect
  camera.updateProjectionMatrix()
}

/** Prefer the center; use the nearest empty label-sized patch if a furnishing covers it. */
export function planLabelAnchor(
  room: RoomLabel,
  occupied: Box[],
  width: number,
  depth: number
): Point2 {
  const center = labelPoint(room.polygon)
  const labelBox = (point: Point2): Box => ({
    center: point,
    x: [1, 0],
    z: [0, 1],
    width: width / 2,
    depth: depth / 2,
  })
  const clear = (box: Box) =>
    insideRoom(room.polygon, box) &&
    !occupied.some((piece) => overlaps(box, piece))
  if (clear(labelBox(center))) return center
  const xs = room.polygon.map(([x]) => x)
  const zs = room.polygon.map(([, z]) => z)
  const left = Math.min(...xs) + width / 2
  const right = Math.max(...xs) - width / 2
  const top = Math.min(...zs) + depth / 2
  const bottom = Math.max(...zs) - depth / 2
  if (right < left || bottom < top) return center
  let nearest = center
  let bestScore = Infinity
  for (let col = 0; col <= 8; col++) {
    for (let row = 0; row <= 8; row++) {
      const candidate: Point2 = [
        left + ((right - left) * col) / 8,
        top + ((bottom - top) * row) / 8,
      ]
      const distance = Math.hypot(
        candidate[0] - center[0],
        candidate[1] - center[1]
      )
      if (distance >= bestScore) continue
      const box = labelBox(candidate)
      if (!clear(box)) continue
      // Prefer a little breathing room at the wall when another free location is nearby.
      const edgeClear = insideRoom(room.polygon, {
        ...box,
        width: box.width + 0.08,
        depth: box.depth + 0.08,
      })
      const score = distance + (edgeClear ? 0 : 0.35)
      if (score < bestScore) {
        nearest = candidate
        bestScore = score
      }
    }
  }
  return nearest
}

/** Layered plan symbols lie flat in the same local X/Z coordinates as the GLB footprint. */
export function planFurnitureSymbol(item: Furniture, entry?: CatalogItem) {
  const width = entry?.width ?? 0.6
  const depth = entry?.depth ?? 0.6
  const group = new THREE.Group()
  const ink = new THREE.Color(item.color).lerp(new THREE.Color("#283931"), 0.64)
  const fill = new THREE.Color(item.color).lerp(new THREE.Color("#fbf7ee"), 0.4)
  const light = new THREE.Color(item.color).lerp(
    new THREE.Color("#ffffff"),
    0.72
  )
  const trim = Math.min(width, depth) * 0.035
  let layer = 0
  function panel(
    x: number,
    z: number,
    w: number,
    d: number,
    color: THREE.Color,
    radius: number
  ) {
    const shape = new THREE.Shape()
    const a = w / 2,
      b = d / 2,
      r = Math.min(radius, a, b)
    shape.moveTo(-a + r, -b)
    shape.lineTo(a - r, -b)
    shape.quadraticCurveTo(a, -b, a, -b + r)
    shape.lineTo(a, b - r)
    shape.quadraticCurveTo(a, b, a - r, b)
    shape.lineTo(-a + r, b)
    shape.quadraticCurveTo(-a, b, -a, b - r)
    shape.lineTo(-a, -b + r)
    shape.quadraticCurveTo(-a, -b, -a + r, -b)
    const mesh = new THREE.Mesh(
      new THREE.ShapeGeometry(shape, 6),
      new THREE.MeshBasicMaterial({ color })
    )
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(x, 0.035 + layer++ * 0.001, z)
    group.add(mesh)
  }
  function edged(
    x: number,
    z: number,
    w: number,
    d: number,
    color: THREE.Color,
    radius: number
  ) {
    panel(x, z, w, d, ink, radius)
    const t = Math.min(trim, w * 0.16, d * 0.16)
    panel(x, z, w - 2 * t, d - 2 * t, color, Math.max(radius - t, 0))
  }
  const r = Math.min(width, depth)
  const id = item.catalogId
  if (item.category === "침대") {
    edged(0, 0, width, depth, fill, r * 0.065)
    const n = id === "bed-day" ? 1 : 2
    for (let i = 0; i < n; i++)
      edged(
        (i - (n - 1) / 2) * width * 0.45,
        -depth * 0.33,
        (width * 0.84) / n,
        depth * 0.2,
        light,
        r * 0.065
      )
    panel(0, -depth * 0.13, width * 0.93, trim, ink, 0)
  } else if (item.category === "소파") {
    edged(0, 0, width, depth, fill, r * 0.15)
    const n = id === "sofa-reading" ? 1 : id === "sofa-moss" ? 2 : 3
    for (let i = 0; i < n; i++) {
      const span = (width * 0.8) / n
      edged(
        (i - (n - 1) / 2) * span,
        depth * 0.055,
        span,
        depth * 0.62,
        light,
        r * 0.065
      )
    }
  } else if (item.category === "의자") {
    const round = id === "chair-stool"
    edged(0, 0, width, depth, fill, r * (round ? 0.5 : 0.18))
    if (!round) panel(0, -depth * 0.3, width * 0.88, trim, ink, trim / 2)
  } else if (item.category === "수납") {
    edged(0, 0, width, depth, fill, r * 0.04)
    panel(0, -depth * 0.2, trim, depth * 0.53, ink, 0)
    panel(0, depth * 0.22, width * 0.93, trim, ink, 0)
  } else if (item.category === "장식") {
    edged(0, 0, width, depth, light, r * 0.5)
    if (id.startsWith("plant-")) {
      for (let i = 0; i < 5; i++) {
        const angle = (i * Math.PI * 2) / 5
        panel(
          Math.sin(angle) * width * 0.17,
          Math.cos(angle) * depth * 0.17,
          width * 0.28,
          depth * 0.29,
          fill,
          r * 0.14
        )
      }
    } else edged(0, 0, width * 0.52, depth * 0.52, fill, r * 0.26)
  } else {
    const round = id === "table-white" || id === "table-side"
    edged(0, 0, width, depth, fill, r * (round ? 0.5 : 0.09))
    if (id === "table-writing")
      panel(width * 0.22, 0, trim, depth * 0.85, ink, 0)
  }
  return group
}
