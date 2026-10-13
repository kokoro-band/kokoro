import { useEffect, useRef, useState } from "react"
import {
  IconPictureLine,
  IconXmarkLine,
} from "@karrotmarket/react-monochrome-icon"
import {
  ActionButton,
  ContentDialog,
  Icon,
  PrefixIcon,
} from "@seed-design/react"
import { Callout } from "seed-design/ui/callout"
import { ProgressCircle } from "seed-design/ui/progress-circle"

import { Type } from "@/components/kokoro/Type"
import {
  analyzeFloorPlan,
  diagnosePlan,
  planToDraft,
  toGrayscale,
  type PlanAnalysis,
  type PlanWarning,
} from "@/features/studio/floor-plan"
import { clampArea, type RoomDraft } from "@/features/studio/room-builder"
import {
  checkPlanImageSize,
  PlanImageError,
  validatePlanImage,
} from "@/features/studio/plan-image"

import { MeterField } from "./MeterField"

type Crop = { x: number; y: number; width: number; height: number }

type Source = {
  canvas: HTMLCanvasElement
  width: number
  height: number
  name: string
}

type Found = { draft: RoomDraft; analysis: PlanAnalysis; crop: Crop }

type Status = "empty" | "loading" | "ready" | "analyzing" | "found" | "failed"

const maxSide = 1200
const maxBytes = 15 * 1024 * 1024
const acceptedTypes = ["image/png", "image/jpeg", "image/webp"]
const imageReadError = "이미지를 읽지 못했어요. 다른 파일을 골라 주세요."

type ImportWork = {
  generation: number
  timer: number | null
  controller: AbortController | null
}

function cancelImportWork(work: ImportWork) {
  work.generation += 1
  if (work.timer !== null) window.clearTimeout(work.timer)
  work.timer = null
  work.controller?.abort()
  work.controller = null
}

const warningText: Record<PlanWarning, { title: string; description: string }> =
  {
    small: {
      title: "이미지가 작아요",
      description:
        "가로 800px 이상인 도면이면 방을 더 정확하게 찾을 수 있어요.",
    },
    colorful: {
      title: "컬러 도면이에요",
      description:
        "흑백 선 도면이 가장 잘 읽혀요. 컬러 도면은 방이 잘못 나뉠 수 있어요.",
    },
  }

function cssColor(name: string, fallback: string) {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim()
  return value || fallback
}

function loadImage(file: File, signal: AbortSignal): Promise<Source> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    function cleanup() {
      image.onload = null
      image.onerror = null
      signal.removeEventListener("abort", abort)
      URL.revokeObjectURL(url)
    }
    function abort() {
      cleanup()
      image.src = ""
      reject(new DOMException("Image load cancelled", "AbortError"))
    }
    image.onload = () => {
      cleanup()
      try {
        checkPlanImageSize(image.naturalWidth, image.naturalHeight)
        const ratio = Math.min(1, maxSide / Math.max(image.width, image.height))
        const width = Math.max(1, Math.round(image.width * ratio))
        const height = Math.max(1, Math.round(image.height * ratio))
        const canvas = document.createElement("canvas")
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext("2d")
        if (!context) throw new Error(imageReadError)
        context.fillStyle = "#fff"
        context.fillRect(0, 0, width, height)
        context.drawImage(image, 0, 0, width, height)
        resolve({ canvas, width, height, name: file.name })
      } catch {
        reject(new Error(imageReadError))
      }
    }
    image.onerror = () => {
      cleanup()
      reject(new Error(imageReadError))
    }
    signal.addEventListener("abort", abort, { once: true })
    image.src = url
  })
}

function pixelsOf(source: Source, crop: Crop) {
  const context = source.canvas.getContext("2d")
  if (!context) return null
  return context.getImageData(crop.x, crop.y, crop.width, crop.height)
}

function fullCrop(source: Source): Crop {
  return { x: 0, y: 0, width: source.width, height: source.height }
}

export function PlanImport({
  initialArea,
  onImport,
  onDrawBlank,
  onClose,
}: {
  initialArea: number
  onImport: (draft: RoomDraft, areaPyeong: number) => void
  /** 도면을 읽지 못했을 때 도면 없이 빈 집에서 그리기 */
  onDrawBlank: () => void
  onClose: () => void
}) {
  const [source, setSource] = useState<Source | null>(null)
  const [crop, setCrop] = useState<Crop | null>(null)
  const [area, setArea] = useState(initialArea)
  const [status, setStatus] = useState<Status>("empty")
  const [warnings, setWarnings] = useState<PlanWarning[]>([])
  const [found, setFound] = useState<Found | null>(null)
  const [error, setError] = useState("")
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const dragRef = useRef<{ x: number; y: number } | null>(null)
  const areaRef = useRef(initialArea)
  const workRef = useRef<ImportWork>({
    generation: 0,
    timer: null,
    controller: null,
  })
  const validationRef = useRef<AbortController | null>(null)

  useEffect(function manageImportLifetime() {
    const work = workRef.current
    return function cancelPendingImport() {
      validationRef.current?.abort()
      validationRef.current = null
      cancelImportWork(work)
    }
  }, [])

  useEffect(
    function drawPlanPreview() {
      const canvas = canvasRef.current
      if (!canvas || !source) return
      canvas.width = source.width
      canvas.height = source.height
      const context = canvas.getContext("2d")
      if (!context) return
      context.drawImage(source.canvas, 0, 0)
      const brand = cssColor("--seed-color-stroke-brand-solid", "#ff6f0f")
      const brandWeak = cssColor("--seed-color-bg-brand-weak", "#fff5f0")
      const scrim = cssColor("--seed-color-bg-overlay", "rgba(0,0,0,0.5)")
      const ink = cssColor("--seed-color-fg-neutral", "#1a1c20")

      if (crop) {
        context.fillStyle = scrim
        context.fillRect(0, 0, source.width, crop.y)
        context.fillRect(
          0,
          crop.y + crop.height,
          source.width,
          source.height - crop.y - crop.height
        )
        context.fillRect(0, crop.y, crop.x, crop.height)
        context.fillRect(
          crop.x + crop.width,
          crop.y,
          source.width - crop.x - crop.width,
          crop.height
        )
        context.strokeStyle = brand
        context.lineWidth = 2
        context.strokeRect(crop.x, crop.y, crop.width, crop.height)
      }

      if (found) {
        context.lineWidth = 2
        context.font = `700 14px ${getComputedStyle(document.body).fontFamily}`
        found.analysis.regions.forEach((region, index) => {
          const x = found.crop.x + region.rect.x
          const y = found.crop.y + region.rect.y
          context.globalAlpha = 0.6
          context.fillStyle = brandWeak
          context.fillRect(x, y, region.rect.width, region.rect.height)
          context.globalAlpha = 1
          context.strokeStyle = brand
          context.strokeRect(x, y, region.rect.width, region.rect.height)
          context.fillStyle = ink
          context.fillText(String(index + 1), x + 6, y + 18)
        })
      }
    },
    [source, crop, found]
  )

  function findRooms(target: Source, region: Crop, areaPyeong: number) {
    const work = workRef.current
    cancelImportWork(work)
    const generation = work.generation
    setStatus("analyzing")
    setError("")
    setFound(null)
    work.timer = window.setTimeout(() => {
      work.timer = null
      if (generation !== work.generation) return
      try {
        const pixels = pixelsOf(target, region)
        if (!pixels) throw new Error(imageReadError)
        const { gray, alpha } = toGrayscale(
          pixels.data,
          region.width,
          region.height
        )
        const analysis = analyzeFloorPlan(
          gray,
          alpha,
          region.width,
          region.height
        )
        const draft = planToDraft(analysis, areaPyeong)
        if (!draft.rooms.length) {
          setStatus("failed")
          setError(
            "방을 찾지 못했어요. 도면 부분만 끌어서 고른 뒤 다시 찾아 보세요."
          )
          return
        }
        setFound({ draft, analysis, crop: region })
        setStatus("found")
      } catch {
        setStatus("failed")
        setError(imageReadError)
      }
    }, 30)
  }

  async function chooseFile(file: File | undefined) {
    if (!file) return
    validationRef.current?.abort()
    validationRef.current = null
    if (!acceptedTypes.includes(file.type)) {
      setError("PNG, JPG, WebP 이미지만 읽을 수 있어요.")
      return
    }
    if (file.size > maxBytes) {
      setError("15MiB 이하의 이미지를 골라 주세요.")
      return
    }
    // A pending decode is not a committed preview. Do not let its continuation
    // start analysis after the user has selected a replacement.
    if (workRef.current.controller) {
      cancelImportWork(workRef.current)
      setStatus("empty")
    }
    const validation = new AbortController()
    validationRef.current = validation
    setError("")
    try {
      await validatePlanImage(file, validation.signal)
    } catch (error) {
      if (validationRef.current !== validation || validation.signal.aborted)
        return
      validationRef.current = null
      setError(error instanceof PlanImageError ? error.message : imageReadError)
      return
    }
    if (validationRef.current !== validation || validation.signal.aborted)
      return
    validationRef.current = null
    const work = workRef.current
    cancelImportWork(work)
    const generation = work.generation
    const controller = new AbortController()
    work.controller = controller
    dragRef.current = null
    setError("")
    setFound(null)
    setCrop(null)
    setSource(null)
    setWarnings([])
    setStatus("loading")
    try {
      const next = await loadImage(file, controller.signal)
      if (generation !== work.generation) return
      work.controller = null
      const pixels = pixelsOf(next, fullCrop(next))
      setWarnings(
        pixels ? diagnosePlan(pixels.data, next.width, next.height) : []
      )
      setSource(next)
      findRooms(next, fullCrop(next), clampArea(areaRef.current))
    } catch {
      if (generation !== work.generation) return
      work.controller = null
      setSource(null)
      setStatus("empty")
      setError(imageReadError)
    }
  }

  function pointToImage(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget
    const box = canvas.getBoundingClientRect()
    return {
      x: Math.round(((event.clientX - box.left) / box.width) * canvas.width),
      y: Math.round(((event.clientY - box.top) / box.height) * canvas.height),
    }
  }

  function startCrop(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!source || status === "analyzing") return
    dragRef.current = pointToImage(event)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function moveCrop(event: React.PointerEvent<HTMLCanvasElement>) {
    const start = dragRef.current
    if (!start || !source) return
    const now = pointToImage(event)
    const x = Math.max(0, Math.min(start.x, now.x))
    const y = Math.max(0, Math.min(start.y, now.y))
    setCrop({
      x,
      y,
      width: Math.min(source.width - x, Math.abs(now.x - start.x)),
      height: Math.min(source.height - y, Math.abs(now.y - start.y)),
    })
    if (found) {
      setFound(null)
      setStatus("ready")
    }
  }

  function endCrop() {
    dragRef.current = null
    setCrop((current) =>
      current && (current.width < 40 || current.height < 40) ? null : current
    )
  }

  const busy = status === "loading" || status === "analyzing"
  const statusText =
    status === "loading"
      ? "도면을 불러오고 있어요"
      : status === "analyzing"
        ? "방을 찾고 있어요"
        : found
          ? `방 ${found.draft.rooms.length}개를 찾았어요`
          : source
            ? crop
              ? `고른 영역 ${crop.width} × ${crop.height}px`
              : `${source.name} · ${source.width} × ${source.height}px`
            : ""

  return (
    <ContentDialog.Root
      open
      size="large"
      onOpenChange={(open) => {
        if (!open) {
          validationRef.current?.abort()
          validationRef.current = null
          cancelImportWork(workRef.current)
          onClose()
        }
      }}
    >
      <ContentDialog.Backdrop />
      <ContentDialog.Positioner>
        <ContentDialog.Content className="plan-import">
          <ContentDialog.Header>
            <ContentDialog.Title>도면 이미지로 시작</ContentDialog.Title>
            <ContentDialog.Description>
              도면을 읽어 방 배치 초안을 만들어요. 초안은 구조에서 바로 고칠 수
              있어요.
            </ContentDialog.Description>
            <ContentDialog.CloseButton aria-label="닫기">
              <Icon svg={<IconXmarkLine />} size="x5" />
            </ContentDialog.CloseButton>
          </ContentDialog.Header>
          <ContentDialog.Body className="plan-import-body">
            <div className="plan-import-stage">
              {source ? (
                <canvas
                  ref={canvasRef}
                  aria-label="도면 미리보기. 끌어서 도면 영역만 고를 수 있어요."
                  onPointerDown={startCrop}
                  onPointerMove={moveCrop}
                  onPointerUp={endCrop}
                  onPointerCancel={endCrop}
                />
              ) : (
                <button
                  type="button"
                  className="plan-import-drop"
                  onClick={() => fileRef.current?.click()}
                  disabled={busy}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault()
                    void chooseFile(event.dataTransfer.files[0])
                  }}
                >
                  <Icon svg={<IconPictureLine />} size="x8" />
                  <Type variant="label">
                    {status === "loading"
                      ? "도면을 불러오고 있어요"
                      : "도면 이미지를 고르거나 여기에 끌어다 놓으세요"}
                  </Type>
                  <Type variant="caption">
                    PNG, JPG, WebP 정지 이미지. 15MiB 이하. 1600만 픽셀 이하.
                  </Type>
                </button>
              )}
              {busy && source && (
                <div className="plan-import-busy">
                  <div className="loading-row">
                    <ProgressCircle size="24" />
                    <Type variant="label">{statusText}</Type>
                  </div>
                </div>
              )}
            </div>

            <div className="plan-import-side">
              <ActionButton
                variant="neutralWeak"
                size="medium"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
              >
                <PrefixIcon svg={<IconPictureLine />} />
                {source ? "다른 이미지 고르기" : "도면 이미지 고르기"}
              </ActionButton>
              <input
                ref={fileRef}
                className="sr-only"
                type="file"
                accept={acceptedTypes.join(",")}
                tabIndex={-1}
                onChange={(event) => {
                  void chooseFile(event.target.files?.[0])
                  event.target.value = ""
                }}
              />
              <MeterField
                label="전용면적"
                value={area}
                min={5}
                max={100}
                step={1}
                suffix="평"
                onCommit={(next) => {
                  areaRef.current = next
                  setArea(next)
                  if (source && status !== "loading") {
                    cancelImportWork(workRef.current)
                    setFound(null)
                    setStatus("ready")
                    setError("")
                  }
                }}
              />
              <Type variant="caption" as="p">
                도면 전체를 이 넓이에 맞춰 키우거나 줄여요. 34평형 아파트의
                전용면적은 약 25평이에요.
              </Type>

              {error && <Callout tone="critical" description={error} />}
              {warnings.map((warning) => (
                <Callout
                  key={warning}
                  tone="warning"
                  title={warningText[warning].title}
                  description={warningText[warning].description}
                />
              ))}

              <div className="plan-import-guide">
                <Type variant="heading" as="h3">
                  잘 읽히는 도면
                </Type>
                <ul>
                  <li>
                    <Type variant="description">
                      벽이 검게 칠해진 흑백 선 도면
                    </Type>
                  </li>
                  <li>
                    <Type variant="description">도면 한 장만 담긴 이미지</Type>
                  </li>
                  <li>
                    <Type variant="description">
                      분양 안내처럼 다른 그림이 함께 있으면 도면 부분만 끌어서
                      골라 주세요
                    </Type>
                  </li>
                </ul>
              </div>
            </div>
          </ContentDialog.Body>
          <ContentDialog.Footer className="plan-import-footer">
            <Type
              variant="caption"
              aria-live="polite"
              className="plan-import-status"
              title={statusText || undefined}
            >
              {statusText}
            </Type>
            <div className="plan-import-actions">
              {status === "failed" && (
                <ActionButton
                  variant="neutralWeak"
                  size="medium"
                  onClick={onDrawBlank}
                >
                  빈 집에서 그리기
                </ActionButton>
              )}
              {source && (status === "ready" || status === "failed") && (
                <ActionButton
                  variant="neutralWeak"
                  size="medium"
                  onClick={() =>
                    findRooms(source, crop ?? fullCrop(source), clampArea(area))
                  }
                >
                  {crop ? "고른 영역에서 찾기" : "다시 찾기"}
                </ActionButton>
              )}
              <ActionButton
                variant="brandSolid"
                size="medium"
                disabled={!found}
                onClick={() => found && onImport(found.draft, clampArea(area))}
              >
                이 배치로 시작
              </ActionButton>
            </div>
          </ContentDialog.Footer>
        </ContentDialog.Content>
      </ContentDialog.Positioner>
    </ContentDialog.Root>
  )
}
