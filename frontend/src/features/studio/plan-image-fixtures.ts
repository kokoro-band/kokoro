// Metadata-only synthetic fixtures. Pixel decoding is separately checked in the browser.
export function joinBytes(...parts: Uint8Array[]) {
  const bytes = new Uint8Array(
    parts.reduce((sum, part) => sum + part.length, 0)
  )
  let offset = 0
  for (const part of parts) {
    bytes.set(part, offset)
    offset += part.length
  }
  return bytes
}

export function pngChunk(type: string, data = new Uint8Array(0)) {
  const bytes = new Uint8Array(data.length + 12)
  new DataView(bytes.buffer).setUint32(0, data.length)
  bytes.set(new TextEncoder().encode(type), 4)
  bytes.set(data, 8)
  return bytes
}

export function pngFixture(width = 200, height = 200, animated = false) {
  const ihdr = new Uint8Array(13)
  const view = new DataView(ihdr.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  ihdr.set([8, 2], 8)
  return joinBytes(
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    ...(animated ? [pngChunk("acTL", new Uint8Array(8))] : []),
    pngChunk("IDAT", new Uint8Array([1])),
    pngChunk("IEND")
  )
}

export function jpegFixture(width = 200, height = 200, progressive = false) {
  return new Uint8Array([
    255,
    216,
    255,
    progressive ? 194 : 192,
    0,
    11,
    8,
    height >> 8,
    height & 255,
    width >> 8,
    width & 255,
    1,
    1,
    17,
    0,
    255,
    218,
    0,
    8,
    1,
    1,
    0,
    0,
    63,
    0,
    1,
    255,
    217,
  ])
}

export function webpChunk(type: string, data: Uint8Array) {
  const bytes = new Uint8Array(8 + data.length + (data.length % 2))
  bytes.set(new TextEncoder().encode(type))
  new DataView(bytes.buffer).setUint32(4, data.length, true)
  bytes.set(data, 8)
  return bytes
}

export function webpContainer(...chunks: Uint8Array[]) {
  const body = joinBytes(new TextEncoder().encode("WEBP"), ...chunks)
  const header = new Uint8Array(8)
  header.set(new TextEncoder().encode("RIFF"))
  new DataView(header.buffer).setUint32(4, body.length, true)
  return joinBytes(header, body)
}

export function webpFixture(width = 200, height = 200, kind = "VP8 ") {
  const frame = new Uint8Array(kind === "VP8L" ? 5 : 10)
  if (kind === "VP8L") {
    frame[0] = 47
    new DataView(frame.buffer).setUint32(
      1,
      width - 1 + (height - 1) * 16384,
      true
    )
  } else {
    frame.set([0, 0, 0, 157, 1, 42])
    new DataView(frame.buffer).setUint16(6, width, true)
    new DataView(frame.buffer).setUint16(8, height, true)
  }
  return webpContainer(webpChunk(kind, frame))
}

export function webpExtended(
  width = 200,
  height = 200,
  flags = 0,
  frameWidth = width
) {
  const header = new Uint8Array(10)
  header[0] = flags
  for (let byte = 0; byte < 3; byte++) {
    header[4 + byte] = ((width - 1) >>> (byte * 8)) & 255
    header[7 + byte] = ((height - 1) >>> (byte * 8)) & 255
  }
  return webpContainer(
    webpChunk("VP8X", header),
    webpFixture(frameWidth, height).slice(12)
  )
}
