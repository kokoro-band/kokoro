import {
  clampArea,
  fitToArea,
  minRoomSize,
  pyeongToSquareMeters,
  round,
  snapToGrid,
  type RoomDraft,
  type RoomRect,
} from "./room-builder"

export type PlanRect = { x: number; y: number; width: number; height: number }

export type PlanRegion = {
  id: number
  pixels: number
  rect: PlanRect
}

export type PlanAnalysis = {
  width: number
  height: number
  threshold: number
  wallThickness: number
  doorWidth: number
  wall: Uint8Array
  closed: Uint8Array
  label: Int32Array
  regions: PlanRegion[]
}

export type PlanOptions = {
  cornerQuality?: number
  doorGap?: number
  minRoomArea?: number
  noiseArea?: number
}

const defaults = {
  cornerQuality: 0.06,
  doorGap: 8,
  minRoomArea: 0.01,
  noiseArea: 0.0006,
}

const edgeTolerance = 0.3

function otsuThreshold(gray: Uint8Array, alpha: Uint8Array) {
  const histogram = new Float64Array(256)
  let total = 0
  for (let i = 0; i < gray.length; i++) {
    if (alpha[i] <= 40) continue
    histogram[gray[i]]++
    total++
  }
  if (total === 0) return 128

  let sum = 0
  for (let level = 0; level < 256; level++) sum += level * histogram[level]

  let backWeight = 0
  let backSum = 0
  let best = 0
  let bestVariance = -1

  for (let level = 0; level < 256; level++) {
    backWeight += histogram[level]
    if (backWeight === 0) continue
    const frontWeight = total - backWeight
    if (frontWeight === 0) break
    backSum += level * histogram[level]
    const backMean = backSum / backWeight
    const frontMean = (sum - backSum) / frontWeight
    const variance = backWeight * frontWeight * (backMean - frontMean) ** 2
    if (variance > bestVariance) {
      bestVariance = variance
      best = level
    }
  }
  return best
}

function boxFilter(
  source: Uint8Array,
  width: number,
  height: number,
  radius: number,
  mode: "min" | "max"
) {
  if (radius <= 0) return source.slice()
  const keep = mode === "min" ? 1 : 0
  const hit = mode === "min" ? 0 : 1
  const pass = new Uint8Array(width * height)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let value = keep
      for (let k = -radius; k <= radius; k++) {
        const sx = x + k
        if (sx < 0 || sx >= width) continue
        if (source[y * width + sx] === hit) {
          value = hit
          break
        }
      }
      pass[y * width + x] = value
    }
  }

  const out = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let value = keep
      for (let k = -radius; k <= radius; k++) {
        const sy = y + k
        if (sy < 0 || sy >= height) continue
        if (pass[sy * width + x] === hit) {
          value = hit
          break
        }
      }
      out[y * width + x] = value
    }
  }
  return out
}

function removeSmallBlobs(
  mask: Uint8Array,
  width: number,
  height: number,
  minArea: number
) {
  const size = width * height
  const seen = new Uint8Array(size)
  const out = new Uint8Array(size)
  const stack: number[] = []
  const members: number[] = []

  for (let start = 0; start < size; start++) {
    if (mask[start] === 0 || seen[start]) continue
    stack.length = 0
    members.length = 0
    stack.push(start)
    seen[start] = 1

    while (stack.length) {
      const index = stack.pop()!
      members.push(index)
      const x = index % width
      const y = (index - x) / width
      const near: number[] = []
      if (x > 0) near.push(index - 1)
      if (x < width - 1) near.push(index + 1)
      if (y > 0) near.push(index - width)
      if (y < height - 1) near.push(index + width)
      for (const next of near) {
        if (mask[next] === 0 || seen[next]) continue
        seen[next] = 1
        stack.push(next)
      }
    }

    if (members.length >= minArea) {
      for (const index of members) out[index] = 1
    }
  }
  return out
}

function measureWallThickness(wall: Uint8Array, width: number, height: number) {
  const size = width * height
  const across = new Int32Array(size)
  const down = new Int32Array(size)

  for (let y = 0; y < height; y++) {
    let start = -1
    for (let x = 0; x <= width; x++) {
      const on = x < width && wall[y * width + x] === 1
      if (on && start < 0) start = x
      if (!on && start >= 0) {
        for (let fill = start; fill < x; fill++) {
          across[y * width + fill] = x - start
        }
        start = -1
      }
    }
  }
  for (let x = 0; x < width; x++) {
    let start = -1
    for (let y = 0; y <= height; y++) {
      const on = y < height && wall[y * width + x] === 1
      if (on && start < 0) start = y
      if (!on && start >= 0) {
        for (let fill = start; fill < y; fill++) {
          down[fill * width + x] = y - start
        }
        start = -1
      }
    }
  }

  const widths: number[] = []
  for (let i = 0; i < size; i++) {
    if (wall[i] === 0) continue
    widths.push(Math.min(across[i], down[i]))
  }
  if (!widths.length) return 4
  widths.sort((left, right) => left - right)
  return Math.max(2, widths[Math.floor(widths.length * 0.5)])
}

function findCorners(
  mask: Uint8Array,
  width: number,
  height: number,
  quality: number
) {
  const size = width * height
  const gx = new Float32Array(size)
  const gy = new Float32Array(size)

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x
      const value = (index: number) => (mask[index] === 1 ? 255 : 0)
      gx[i] =
        value(i - width + 1) +
        2 * value(i + 1) +
        value(i + width + 1) -
        value(i - width - 1) -
        2 * value(i - 1) -
        value(i + width - 1)
      gy[i] =
        value(i + width - 1) +
        2 * value(i + width) +
        value(i + width + 1) -
        value(i - width - 1) -
        2 * value(i - width) -
        value(i - width + 1)
    }
  }

  const blur = (source: Float32Array) => {
    const pass = new Float32Array(size)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let total = 0
        for (let k = -2; k <= 2; k++) {
          const sx = Math.min(width - 1, Math.max(0, x + k))
          total += source[y * width + sx]
        }
        pass[y * width + x] = total
      }
    }
    const out = new Float32Array(size)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let total = 0
        for (let k = -2; k <= 2; k++) {
          const sy = Math.min(height - 1, Math.max(0, y + k))
          total += pass[sy * width + x]
        }
        out[y * width + x] = total
      }
    }
    return out
  }

  const xx = new Float32Array(size)
  const yy = new Float32Array(size)
  const xy = new Float32Array(size)
  for (let i = 0; i < size; i++) {
    xx[i] = gx[i] * gx[i]
    yy[i] = gy[i] * gy[i]
    xy[i] = gx[i] * gy[i]
  }

  const sxx = blur(xx)
  const syy = blur(yy)
  const sxy = blur(xy)

  let peak = 0
  const response = new Float32Array(size)
  for (let i = 0; i < size; i++) {
    const trace = sxx[i] + syy[i]
    const value = sxx[i] * syy[i] - sxy[i] * sxy[i] - 0.04 * trace * trace
    response[i] = value
    if (value > peak) peak = value
  }

  const corners = new Uint8Array(size)
  const limit = peak * quality
  for (let i = 0; i < size; i++) corners[i] = response[i] > limit ? 1 : 0
  return corners
}

function closeDoorways(
  wall: Uint8Array,
  corners: Uint8Array,
  width: number,
  height: number,
  maxGap: number
) {
  const closed = wall.slice()
  const near = boxFilter(corners, width, height, 2, "max")

  for (let y = 0; y < height; y++) {
    let previous = -1
    for (let x = 0; x < width; x++) {
      if (wall[y * width + x] === 0) continue
      const gap = x - previous - 1
      if (
        previous >= 0 &&
        gap > 0 &&
        gap <= maxGap &&
        near[y * width + previous] === 1 &&
        near[y * width + x] === 1
      ) {
        for (let fill = previous + 1; fill < x; fill++) {
          closed[y * width + fill] = 1
        }
      }
      previous = x
    }
  }

  for (let x = 0; x < width; x++) {
    let previous = -1
    for (let y = 0; y < height; y++) {
      if (wall[y * width + x] === 0) continue
      const gap = y - previous - 1
      if (
        previous >= 0 &&
        gap > 0 &&
        gap <= maxGap &&
        near[previous * width + x] === 1 &&
        near[y * width + x] === 1
      ) {
        for (let fill = previous + 1; fill < y; fill++) {
          closed[fill * width + x] = 1
        }
      }
      previous = y
    }
  }
  return closed
}

function findOutside(wall: Uint8Array, width: number, height: number) {
  const size = width * height
  const outside = new Uint8Array(size)
  const stack: number[] = []
  for (let x = 0; x < width; x++) stack.push(x, (height - 1) * width + x)
  for (let y = 0; y < height; y++) stack.push(y * width, y * width + width - 1)

  while (stack.length) {
    const index = stack.pop()!
    if (outside[index] || wall[index] === 1) continue
    outside[index] = 1
    const x = index % width
    const y = (index - x) / width
    if (x > 0) stack.push(index - 1)
    if (x < width - 1) stack.push(index + 1)
    if (y > 0) stack.push(index - width)
    if (y < height - 1) stack.push(index + width)
  }
  return outside
}

function insideRect(
  label: Int32Array,
  width: number,
  id: number,
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
): PlanRect {
  const span = bounds.maxX - bounds.minX + 1
  const heights = new Int32Array(span)
  let best: PlanRect & { area: number } = {
    x: bounds.minX,
    y: bounds.minY,
    width: 1,
    height: 1,
    area: 0,
  }

  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    for (let column = 0; column < span; column++) {
      const index = y * width + bounds.minX + column
      heights[column] = label[index] === id ? heights[column] + 1 : 0
    }
    const stack: number[] = []
    for (let column = 0; column <= span; column++) {
      const current = column === span ? 0 : heights[column]
      while (stack.length && heights[stack[stack.length - 1]] >= current) {
        const top = stack.pop()!
        const left = stack.length ? stack[stack.length - 1] + 1 : 0
        const rectWidth = column - left
        const rectHeight = heights[top]
        const area = rectWidth * rectHeight
        if (area > best.area) {
          best = {
            x: bounds.minX + left,
            y: y - rectHeight + 1,
            width: rectWidth,
            height: rectHeight,
            area,
          }
        }
      }
      stack.push(column)
    }
  }
  return { x: best.x, y: best.y, width: best.width, height: best.height }
}

function labelRooms(
  free: Uint8Array,
  width: number,
  height: number,
  minArea: number
) {
  const size = width * height
  const label = new Int32Array(size).fill(-1)
  const found: {
    id: number
    pixels: number
    minX: number
    minY: number
    maxX: number
    maxY: number
  }[] = []
  const stack: number[] = []

  for (let start = 0; start < size; start++) {
    if (free[start] === 0 || label[start] !== -1) continue
    const id = found.length
    const region = {
      id,
      pixels: 0,
      minX: width,
      minY: height,
      maxX: 0,
      maxY: 0,
    }
    label[start] = id
    stack.length = 0
    stack.push(start)

    while (stack.length) {
      const index = stack.pop()!
      const x = index % width
      const y = (index - x) / width
      region.pixels++
      if (x < region.minX) region.minX = x
      if (x > region.maxX) region.maxX = x
      if (y < region.minY) region.minY = y
      if (y > region.maxY) region.maxY = y

      const near: number[] = []
      if (x > 0) near.push(index - 1)
      if (x < width - 1) near.push(index + 1)
      if (y > 0) near.push(index - width)
      if (y < height - 1) near.push(index + width)
      for (const next of near) {
        if (free[next] === 0 || label[next] !== -1) continue
        label[next] = id
        stack.push(next)
      }
    }
    found.push(region)
  }

  const regions: PlanRegion[] = found
    .filter((region) => region.pixels >= minArea)
    .map((region) => ({
      id: region.id,
      pixels: region.pixels,
      rect: insideRect(label, width, region.id, region),
    }))

  return { regions, label }
}

export function analyzeFloorPlan(
  gray: Uint8Array,
  alpha: Uint8Array,
  width: number,
  height: number,
  options: PlanOptions = {}
): PlanAnalysis {
  const settings = { ...defaults, ...options }
  const size = width * height

  const threshold = otsuThreshold(gray, alpha)
  const ink = new Uint8Array(size)
  for (let i = 0; i < size; i++) {
    ink[i] = alpha[i] > 40 && gray[i] <= threshold ? 1 : 0
  }

  const wall = removeSmallBlobs(ink, width, height, size * settings.noiseArea)
  const wallThickness = measureWallThickness(wall, width, height)
  const corners = findCorners(wall, width, height, settings.cornerQuality)
  const doorWidth = Math.round(wallThickness * settings.doorGap)
  const closed = closeDoorways(wall, corners, width, height, doorWidth)

  const outside = findOutside(closed, width, height)
  const free = new Uint8Array(size)
  for (let i = 0; i < size; i++) {
    free[i] = closed[i] === 0 && outside[i] === 0 ? 1 : 0
  }

  const { regions, label } = labelRooms(
    free,
    width,
    height,
    size * settings.minRoomArea
  )

  return {
    width,
    height,
    threshold,
    wallThickness,
    doorWidth,
    wall,
    closed,
    label,
    regions,
  }
}

export function alignEdges(values: number[], tolerance = edgeTolerance) {
  const sorted = [...new Set(values)].sort((left, right) => left - right)
  const aligned = new Map<number, number>()
  let group: number[] = []

  const flush = () => {
    if (!group.length) return
    const middle = snapToGrid(
      group.reduce((total, value) => total + value, 0) / group.length
    )
    for (const value of group) aligned.set(value, middle)
    group = []
  }

  for (const value of sorted) {
    if (group.length && value - group[group.length - 1] > tolerance) flush()
    group.push(value)
  }
  flush()
  return aligned
}

export function planToDraft(
  analysis: PlanAnalysis,
  areaPyeong: number,
  wallHeight = 2.4
): RoomDraft {
  if (!analysis.regions.length) return { rooms: [], wallHeight }

  const grow = analysis.wallThickness / 2
  const boxes = analysis.regions.map((region) => ({
    left: region.rect.x - grow,
    top: region.rect.y - grow,
    right: region.rect.x + region.rect.width + grow,
    bottom: region.rect.y + region.rect.height + grow,
  }))
  const pixels = boxes.reduce(
    (total, box) => total + (box.right - box.left) * (box.bottom - box.top),
    0
  )
  if (pixels <= 0) return { rooms: [], wallHeight }

  const area = pyeongToSquareMeters(clampArea(areaPyeong))
  const scale = Math.sqrt(area / pixels)

  const raw = boxes.map((box) => ({
    left: box.left * scale,
    top: box.top * scale,
    right: box.right * scale,
    bottom: box.bottom * scale,
  }))

  const tolerance = Math.max(
    edgeTolerance,
    analysis.wallThickness * scale * 1.2
  )
  const alignedX = alignEdges(
    raw.flatMap((item) => [item.left, item.right]),
    tolerance
  )
  const alignedZ = alignEdges(
    raw.flatMap((item) => [item.top, item.bottom]),
    tolerance
  )

  const rooms: RoomRect[] = []
  raw.forEach((item, index) => {
    const x = alignedX.get(item.left)!
    const z = alignedZ.get(item.top)!
    const width = round(alignedX.get(item.right)! - x)
    const depth = round(alignedZ.get(item.bottom)! - z)
    if (width < minRoomSize || depth < minRoomSize) return
    rooms.push({
      id: `room-${rooms.length + 1}`,
      name: index === 0 ? "거실" : `방 ${rooms.length}`,
      x,
      z,
      width,
      depth,
    })
  })

  if (!rooms.length) return { rooms: [], wallHeight }

  return fitToArea(
    {
      rooms,
      wallHeight,
      source: {
        areaPyeong: clampArea(areaPyeong),
        roomCount: rooms.length,
        preset: "plan-v1",
      },
    },
    areaPyeong
  ).draft
}

export type PlanWarning = "small" | "colorful"

export function toGrayscale(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number
) {
  const size = width * height
  const gray = new Uint8Array(size)
  const alpha = new Uint8Array(size)
  for (let i = 0; i < size; i++) {
    gray[i] = Math.round(
      (data[i * 4] * 299 + data[i * 4 + 1] * 587 + data[i * 4 + 2] * 114) / 1000
    )
    alpha[i] = data[i * 4 + 3]
  }
  return { gray, alpha }
}

export function diagnosePlan(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number
): PlanWarning[] {
  const warnings: PlanWarning[] = []
  if (Math.max(width, height) < 600) warnings.push("small")

  let colorful = 0
  let counted = 0
  for (let i = 0; i < width * height; i += 4) {
    const r = data[i * 4]
    const g = data[i * 4 + 1]
    const b = data[i * 4 + 2]
    if (Math.max(r, g, b) - Math.min(r, g, b) > 40) colorful++
    counted++
  }
  if (counted > 0 && colorful / counted > 0.05) warnings.push("colorful")
  return warnings
}
