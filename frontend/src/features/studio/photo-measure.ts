/**
 * 사진으로 가구 크기를 재는 로컬 측정 서버(photo-measure/) 연결입니다.
 * Ollama처럼 시연 PC에서 따로 켜 두고 브라우저가 직접 부릅니다.
 */
import { customFurnitureId, type Furniture } from "./types"

export type PhotoBox = [x0: number, y0: number, x1: number, y1: number]
export type MeasuredSize = {
  widthCm: number
  depthCm: number
  heightCm: number
  floorFound: boolean
}
export type MeasureFailure =
  | "offline"
  | "bad_photo"
  | "bad_box"
  | "too_large"
  | "measure_failed"
  | "unknown"

export class PhotoMeasureError extends Error {
  readonly kind: MeasureFailure

  constructor(kind: MeasureFailure, message: string) {
    super(message)
    this.name = "PhotoMeasureError"
    this.kind = kind
  }
}

export const measureServerUrl =
  import.meta.env.VITE_MEASURE_URL ?? "http://127.0.0.1:8790"
export const maxPhotoBytes = 25 * 1024 * 1024
// 저장 경계(0.05~5m)와 같습니다.
export const minSideCm = 5
export const maxSideCm = 500
const minBoxSide = 0.02

const fallbackMessages: Record<MeasureFailure, string> = {
  offline:
    "측정 서버에 연결하지 못했어요. 이 PC에서 photo-measure 서버를 켠 뒤 다시 시도해 주세요.",
  bad_photo: "사진 파일을 읽지 못했어요. JPG나 PNG 원본 사진을 골라 주세요.",
  bad_box: "가구 영역을 다시 그려 주세요.",
  too_large: "사진 파일이 너무 커요. 25MB 이하 사진을 골라 주세요.",
  measure_failed:
    "가구를 찾지 못했어요. 가구만 감싸도록 상자를 다시 그려 주세요.",
  unknown: "측정 결과를 읽지 못했어요. 잠시 뒤 다시 시도해 주세요.",
}

function fail(kind: MeasureFailure, message?: unknown): never {
  throw new PhotoMeasureError(
    kind,
    typeof message === "string" && message.trim()
      ? message
      : fallbackMessages[kind]
  )
}

const positive = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0

/** 고른 사진 파일을 그대로 보냅니다. 줄이거나 다시 인코딩하면 EXIF 화각 정보가 사라집니다. */
export async function measurePhoto(
  photo: Blob,
  box: PhotoBox,
  {
    fetch: fetchImpl = globalThis.fetch.bind(globalThis),
    signal,
    url = measureServerUrl,
  }: { fetch?: typeof fetch; signal?: AbortSignal; url?: string } = {}
): Promise<MeasuredSize> {
  if (!photo.type.startsWith("image/")) fail("bad_photo")
  if (photo.size > maxPhotoBytes) fail("too_large")
  let response: Response
  try {
    response = await fetchImpl(`${url}/measure?box=${box.join(",")}`, {
      method: "POST",
      headers: { "Content-Type": photo.type },
      body: photo,
      signal,
    })
  } catch (error) {
    if (signal?.aborted) throw error
    fail("offline")
  }
  const body: unknown = await response.json().catch(() => null)
  const data = (body && typeof body === "object" ? body : {}) as Record<
    string,
    unknown
  >
  if (!response.ok) {
    const kind =
      typeof data.error === "string" && data.error in fallbackMessages
        ? (data.error as MeasureFailure)
        : response.status === 413
          ? "too_large"
          : "unknown"
    fail(kind, data.message)
  }
  if (
    !positive(data.widthCm) ||
    !positive(data.depthCm) ||
    !positive(data.heightCm) ||
    typeof data.floorFound !== "boolean"
  )
    fail("unknown")
  return {
    widthCm: data.widthCm,
    depthCm: data.depthCm,
    heightCm: data.heightCm,
    floorFound: data.floorFound,
  }
}

const unit = (value: number) =>
  Math.round(Math.min(1, Math.max(0, value)) * 10000) / 10000

/** 사진 위에서 끈 두 점(화면 좌표)을 사진 기준 0~1 비율 상자로 바꿉니다. 너무 작으면 null입니다. */
export function boxFromDrag(
  start: [number, number],
  end: [number, number],
  frame: { left: number; top: number; width: number; height: number }
): PhotoBox | null {
  if (frame.width <= 0 || frame.height <= 0) return null
  const xs = [start[0], end[0]].map((x) => unit((x - frame.left) / frame.width))
  const ys = [start[1], end[1]].map((y) => unit((y - frame.top) / frame.height))
  const box: PhotoBox = [
    Math.min(...xs),
    Math.min(...ys),
    Math.max(...xs),
    Math.max(...ys),
  ]
  if (box[2] - box[0] < minBoxSide || box[3] - box[1] < minBoxSide) return null
  return box
}

const meters = (cm: number) => {
  if (!Number.isFinite(cm) || cm < minSideCm || cm > maxSideCm)
    throw new Error(`가구 크기는 ${minSideCm}~${maxSideCm}cm로 입력해 주세요.`)
  return Math.round(cm) / 100
}

export const customFurnitureColor = "#D9D4CC"

/** 보정한 측정값으로 직접 추가할 가구를 만듭니다. 위치는 놓을 때 정합니다. */
export function makeCustomFurniture(spec: {
  name: string
  category: Furniture["category"]
  widthCm: number
  depthCm: number
  heightCm: number
}): Furniture {
  const name = spec.name.trim()
  if (!name || name.length > 200) throw new Error("가구 이름을 입력해 주세요.")
  return {
    id: crypto.randomUUID(),
    catalogId: customFurnitureId,
    name,
    category: spec.category,
    x: 0,
    z: 0,
    rotation: 0,
    color: customFurnitureColor,
    size: {
      width: meters(spec.widthCm),
      depth: meters(spec.depthCm),
      height: meters(spec.heightCm),
    },
  }
}
