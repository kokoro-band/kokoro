export const maxPlanImageBytes = 15 * 1024 * 1024
export const maxPlanImagePixels = 16_000_000
export const planImageReadError =
  "파일을 읽지 못했어요. 정상적인 PNG, JPG, WebP 이미지를 골라 주세요."
const pixelError = "1600만 픽셀 이하로 이미지 크기를 줄여 주세요."
const animationError =
  "움직이는 도면은 읽을 수 없어요. 정지 이미지로 저장해 주세요."
const structureLimit = 4096
type Size = { width: number; height: number }

export class PlanImageError extends Error {}
function invalid(): never {
  throw new PlanImageError(planImageReadError)
}
function animated(): never {
  throw new PlanImageError(animationError)
}

export function checkPlanImageSize(width: number, height: number): Size {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0
  )
    invalid()
  if (width * height > maxPlanImagePixels) throw new PlanImageError(pixelError)
  return { width, height }
}

// Header inspection only. The browser remains responsible for pixel decoding.
// Format references and intentional limits are documented in docs/contracts/api.md.
export function inspectPlanImage(
  bytes: Uint8Array,
  name: string,
  mime: string
): Size {
  if (bytes.length > maxPlanImageBytes)
    throw new PlanImageError("15MiB 이하의 이미지를 골라 주세요.")
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const requireBytes = (offset: number, length: number) => {
    if (offset < 0 || length < 0 || offset + length > bytes.length) invalid()
  }
  const text = (offset: number, length = 4) => {
    requireBytes(offset, length)
    return String.fromCharCode(...bytes.subarray(offset, offset + length))
  }
  const uint24 = (offset: number) =>
    bytes[offset] + bytes[offset + 1] * 256 + bytes[offset + 2] * 65536
  const extension = name.match(/\.([^.]+)$/)?.[1].toLowerCase()
  if (!extension || !["png", "jpg", "jpeg", "webp"].includes(extension))
    invalid()
  const expectedMime = extension === "jpg" ? "image/jpeg" : `image/${extension}`
  if (mime.toLowerCase() !== expectedMime) invalid()

  if (expectedMime === "image/png") {
    if (text(0, 8) !== "\x89PNG\r\n\x1a\n") invalid()
    let size: Size | undefined
    let imageData = false
    let offset = 8
    for (let count = 0; count < structureLimit; count++) {
      requireBytes(offset, 12)
      const length = view.getUint32(offset)
      const type = text(offset + 4)
      requireBytes(offset, length + 12)
      const data = offset + 8
      if (!size && type !== "IHDR") invalid()
      if (type === "IHDR") {
        if (size || length !== 13) invalid()
        size = checkPlanImageSize(
          view.getUint32(data),
          view.getUint32(data + 4)
        )
      }
      if (["acTL", "fcTL", "fdAT"].includes(type)) animated()
      if (type === "IDAT") imageData = true
      offset += length + 12
      if (type === "IEND") {
        if (!size || !imageData || length !== 0 || offset !== bytes.length)
          invalid()
        return size
      }
    }
    invalid()
  }

  if (expectedMime === "image/jpeg") {
    requireBytes(0, 2)
    if (view.getUint16(0) !== 0xffd8) invalid()
    let offset = 2
    let size: Size | undefined
    for (let count = 0; count < structureLimit; count++) {
      requireBytes(offset, 2)
      if (bytes[offset++] !== 255) invalid()
      while (bytes[offset] === 255) offset++
      requireBytes(offset, 3)
      const marker = bytes[offset++]
      const length = view.getUint16(offset)
      if (length < 2) invalid()
      requireBytes(offset, length)
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        ![0xc4, 0xc8, 0xcc].includes(marker)
      ) {
        if (size || ![0xc0, 0xc1, 0xc2].includes(marker) || length < 8)
          invalid()
        if (length !== 8 + 3 * bytes[offset + 7]) invalid()
        size = checkPlanImageSize(
          view.getUint16(offset + 5),
          view.getUint16(offset + 3)
        )
      }
      if (marker === 0xda) {
        if (!size) invalid()
        return size
      }
      // Standalone markers and deferred dimensions are not valid in this header path.
      if (marker === 0 || marker === 0xdc || (marker >= 0xd0 && marker <= 0xd9))
        invalid()
      offset += length
    }
    invalid()
  }

  if (
    text(0) !== "RIFF" ||
    text(8) !== "WEBP" ||
    view.getUint32(4, true) + 8 !== bytes.length
  )
    invalid()
  let canvas: Size | undefined
  let frame: Size | undefined
  let offset = 12
  for (
    let count = 0;
    count < structureLimit && offset < bytes.length;
    count++
  ) {
    requireBytes(offset, 8)
    const type = text(offset)
    const length = view.getUint32(offset + 4, true)
    const data = offset + 8
    requireBytes(data, length + (length % 2))
    if (type === "ANIM" || type === "ANMF") animated()
    if (type === "VP8X") {
      if (offset !== 12 || canvas || length !== 10) invalid()
      if (bytes[data] & 2) animated()
      canvas = checkPlanImageSize(uint24(data + 4) + 1, uint24(data + 7) + 1)
    }
    if (type === "VP8 " || type === "VP8L") {
      if (frame) invalid()
      if (type === "VP8 ") {
        if (
          length < 10 ||
          (bytes[data] & 1) !== 0 ||
          text(data + 3, 3) !== "\x9d\x01\x2a"
        )
          invalid()
        frame = checkPlanImageSize(
          view.getUint16(data + 6, true) & 0x3fff,
          view.getUint16(data + 8, true) & 0x3fff
        )
      } else {
        if (length < 5 || bytes[data] !== 47 || (bytes[data + 4] & 0xe0) !== 0)
          invalid()
        const bits = view.getUint32(data + 1, true)
        frame = checkPlanImageSize(
          (bits & 0x3fff) + 1,
          ((bits >>> 14) & 0x3fff) + 1
        )
      }
    }
    offset = data + length + (length % 2)
  }
  if (offset !== bytes.length || !frame) invalid()
  if (
    canvas &&
    (canvas.width !== frame.width || canvas.height !== frame.height)
  )
    invalid()
  return frame
}

export function validatePlanImage(
  file: File,
  signal: AbortSignal
): Promise<Size> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    function cleanup() {
      reader.onload = null
      reader.onerror = null
      reader.onabort = null
      signal.removeEventListener("abort", abort)
    }
    function abort() {
      cleanup()
      reader.abort()
      reject(new DOMException("Image validation cancelled", "AbortError"))
    }
    if (signal.aborted) {
      abort()
      return
    }
    signal.addEventListener("abort", abort, { once: true })
    reader.onerror = () => {
      cleanup()
      reject(new PlanImageError(planImageReadError))
    }
    reader.onabort = () => {
      cleanup()
      reject(new DOMException("Image validation cancelled", "AbortError"))
    }
    reader.onload = () => {
      cleanup()
      try {
        if (!(reader.result instanceof ArrayBuffer)) invalid()
        resolve(
          inspectPlanImage(new Uint8Array(reader.result), file.name, file.type)
        )
      } catch (error) {
        reject(error)
      }
    }
    if (file.size > maxPlanImageBytes) {
      cleanup()
      reject(new PlanImageError("15MiB 이하의 이미지를 골라 주세요."))
      return
    }
    try {
      reader.readAsArrayBuffer(file)
    } catch {
      cleanup()
      reject(new PlanImageError(planImageReadError))
    }
  })
}
