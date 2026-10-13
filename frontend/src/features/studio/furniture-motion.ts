import {
  footprint,
  insideRoom,
  overlaps,
  wallBox,
  type Box,
} from "./placement-issues"
import type { Furniture, Point2, Project, RoomLabel } from "./types"

const EPSILON = 1e-8
const SKIN = 1e-6
const SNAP_DISTANCE = 0.1
const dot = (a: Point2, b: Point2) => a[0] * b[0] + a[1] * b[1]
const subtract = (a: Point2, b: Point2): Point2 => [a[0] - b[0], a[1] - b[1]]
const radius = (box: Box, axis: Point2) =>
  Math.abs(dot(box.x, axis)) * box.width +
  Math.abs(dot(box.z, axis)) * box.depth

function constraints(project: Project, focus?: RoomLabel | null) {
  const bounds = project.room?.bounds ?? project.dimensions
  const outline: Point2[] = project.room?.outline.length
    ? project.room.outline
    : [
        [0, 0],
        [bounds.width, 0],
        [bounds.width, bounds.depth],
        [0, bounds.depth],
      ]
  const polygons = focus ? [outline, focus.polygon] : [outline]
  const walls = project.room?.walls.map(wallBox) ?? []
  // Zero-thickness polygon edges still take part in the sweep, including
  // concave notches and room labels that do not have a physical wall.
  const obstacles = [
    ...walls,
    ...polygons.flatMap((polygon) =>
      polygon.map((a, index) =>
        wallBox({
          id: "boundary",
          a,
          b: polygon[(index + 1) % polygon.length],
          thickness: 0,
        })
      )
    ),
  ]
  return {
    bounds,
    obstacles,
    valid(item: Furniture) {
      const box = footprint(item)
      return (
        !!box &&
        polygons.every((polygon) => insideRoom(polygon, box)) &&
        !walls.some((wall) => overlaps(box, wall))
      )
    },
  }
}

/** Earliest contact during the entire translation, not just its endpoint. */
function sweep(box: Box, obstacle: Box, delta: Point2) {
  const offset = subtract(box.center, obstacle.center)
  let enter = -Infinity
  let exit = Infinity
  let normal: Point2 = [0, 0]
  for (const axis of [box.x, box.z, obstacle.x, obstacle.z]) {
    const distance = dot(offset, axis)
    const speed = dot(delta, axis)
    const extent = radius(box, axis) + radius(obstacle, axis)
    if (Math.abs(speed) < EPSILON) {
      // Touching and moving parallel does not collide.
      if (Math.abs(distance) >= extent - EPSILON) return null
      continue
    }
    const a = (-extent - distance) / speed
    const b = (extent - distance) / speed
    const first = Math.min(a, b)
    if (first > enter) {
      enter = first
      normal = speed > 0 ? [-axis[0], -axis[1]] : axis
    }
    exit = Math.min(exit, Math.max(a, b))
    if (enter > exit) return null
  }
  if (
    exit <= EPSILON ||
    enter < -EPSILON ||
    enter > 1 ||
    enter >= exit - EPSILON
  )
    return null
  return { time: Math.max(0, enter), normal }
}

function slide(item: Furniture, target: Point2, obstacles: Box[]): Furniture {
  let next = { ...item }
  let delta = subtract(target, [item.x, item.z])
  for (
    let attempt = 0;
    attempt < 4 && Math.hypot(...delta) > EPSILON;
    attempt++
  ) {
    const box = footprint(next)
    if (!box) break
    let hit: ReturnType<typeof sweep> = null
    for (const obstacle of obstacles) {
      const contact = sweep(box, obstacle, delta)
      if (contact && (!hit || contact.time < hit.time)) hit = contact
    }
    if (!hit) return { ...next, x: next.x + delta[0], z: next.z + delta[1] }
    const time = Math.max(0, hit.time - SKIN / Math.hypot(...delta))
    next = { ...next, x: next.x + delta[0] * time, z: next.z + delta[1] * time }
    const remaining: Point2 = [delta[0] * (1 - time), delta[1] * (1 - time)]
    const intoWall = Math.min(0, dot(remaining, hit.normal))
    delta = [
      remaining[0] - intoWall * hit.normal[0],
      remaining[1] - intoWall * hit.normal[1],
    ]
  }
  return next
}

function snap(
  item: Furniture,
  delta: Point2,
  scene: ReturnType<typeof constraints>
) {
  let next = item
  // Two passes allow both faces of an inside corner to snap.
  for (let pass = 0; pass < 2; pass++) {
    const box = footprint(next)
    if (!box) return next
    let best = SNAP_DISTANCE + EPSILON
    let candidate: Furniture | null = null
    for (const wall of scene.obstacles) {
      const offset = subtract(box.center, wall.center)
      if (Math.abs(dot(offset, wall.x)) > wall.width + radius(box, wall.x))
        continue
      const signed = dot(offset, wall.z)
      const normal: Point2 = signed < 0 ? [-wall.z[0], -wall.z[1]] : wall.z
      if (dot(delta, normal) >= -EPSILON) continue
      const gap = Math.abs(signed) - radius(box, wall.z) - wall.depth
      if (gap <= SKIN * 2 || gap > best) continue
      const aligned = {
        ...next,
        x: next.x - normal[0] * gap,
        z: next.z - normal[1] * gap,
      }
      if (scene.valid(aligned)) {
        best = gap
        candidate = aligned
      }
    }
    if (!candidate) break
    // A snap must not jump over another wall at a corner.
    next = slide(next, [candidate.x, candidate.z], scene.obstacles)
  }
  return next
}

/** Find a wall-safe position for newly added or previously invalid furniture. */
export function findFurniturePlacement(
  project: Project,
  item: Furniture,
  focus?: RoomLabel | null
): Furniture | null {
  const scene = constraints(project, focus)
  if (scene.valid(item)) return item
  const box = footprint(item)
  if (
    !box ||
    radius(box, [1, 0]) * 2 > scene.bounds.width ||
    radius(box, [0, 1]) * 2 > scene.bounds.depth
  )
    return null
  const candidates: Furniture[] = []
  for (const wall of scene.obstacles) {
    for (const sign of [-1, 1]) {
      const distance = dot(subtract(box.center, wall.center), wall.z)
      const shift = sign * (radius(box, wall.z) + wall.depth + SKIN) - distance
      candidates.push({
        ...item,
        x: item.x + wall.z[0] * shift,
        z: item.z + wall.z[1] * shift,
      })
    }
  }
  candidates.sort(
    (a, b) =>
      Math.hypot(a.x - item.x, a.z - item.z) -
      Math.hypot(b.x - item.x, b.z - item.z)
  )
  const projected = candidates.find((candidate) => scene.valid(candidate))
  if (projected) return projected
  // Search only on insertion/recovery, never on each valid drag frame.
  const x = Math.max(0, Math.min(scene.bounds.width, item.x))
  const z = Math.max(0, Math.min(scene.bounds.depth, item.z))
  const count = Math.ceil(
    Math.max(scene.bounds.width, scene.bounds.depth) / 0.1
  )
  for (let ring = 0; ring <= count; ring++) {
    for (let step = -ring; step <= ring; step++) {
      const points: Point2[] = [
        [step, -ring],
        [step, ring],
        [-ring, step],
        [ring, step],
      ]
      for (const [dx, dz] of points) {
        const candidate = { ...item, x: x + dx * 0.1, z: z + dz * 0.1 }
        if (scene.valid(candidate)) return candidate
      }
    }
  }
  return null
}

/** All manual editing paths use this before previewing or saving a pose. */
export function constrainFurniturePose(
  project: Project,
  current: Furniture,
  update: Partial<Pick<Furniture, "x" | "z" | "rotation">>,
  focus?: RoomLabel | null
): Furniture {
  const target = { ...current, ...update }
  if (![target.x, target.z, target.rotation].every(Number.isFinite))
    return current
  const scene = constraints(project, focus)
  if (!scene.valid(current)) {
    return findFurniturePlacement(project, target, focus) ?? current
  }
  let next = current
  const angle = ((target.rotation - current.rotation + 540) % 360) - 180
  // Inspect the turn as well as its final footprint (a 180-degree turn may
  // have a valid endpoint but sweep the long side of a sofa through a wall).
  const steps = Math.ceil(Math.abs(angle) / 0.5)
  for (let step = 1; step <= steps; step++) {
    const rotated = {
      ...current,
      rotation: (current.rotation + (angle * step) / steps + 360) % 360,
    }
    if (!scene.valid(rotated)) break
    next = rotated
  }
  next = slide(next, [target.x, target.z], scene.obstacles)
  next = snap(
    next,
    subtract([target.x, target.z], [current.x, current.z]),
    scene
  )
  return scene.valid(next) ? next : current
}
