import { useEffect, useRef, useState } from "react"
import { FileImage, LoaderCircle, ScanSearch, X } from "lucide-react"

import {
  analyzeFloorPlan,
  diagnosePlan,
  planToDraft,
  toGrayscale,
  type PlanAnalysis,
  type PlanWarning,
} from "@/features/studio/floor-plan"
import { clampArea, type RoomDraft } from "@/features/studio/room-builder"

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

const warningText: Record<PlanWarning, string> = {
  small: "이미지가 작습니다. 가로 800px 이상이면 더 정확합니다.",
  colorful:
    "컬러 도면으로 보입니다. 흑백 선 도면이 가장 잘 인식되고, 컬러 도면은 방이 잘못 나뉠 수 있습니다.",
}

function loadImage(file: File): Promise<Source> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      const ratio = Math.min(1, maxSide / Math.max(image.width, image.height))
      const width = Math.max(1, Math.round(image.width * ratio))
      const height = Math.max(1, Math.round(image.height * ratio))
      const canvas = document.createElement("canvas")
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext("2d")
      if (!context) {
        reject(new Error("이미지를 읽지 못했습니다."))
        return
      }
      context.fillStyle = "#fff"
      context.fillRect(0, 0, width, height)
      context.drawImage(image, 0, 0, width, height)
      resolve({ canvas, width, height, name: file.name })
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("이미지를 읽지 못했습니다."))
    }
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
  onClose,
}: {
  initialArea: number
  onImport: (draft: RoomDraft, areaPyeong: number) => void
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
  const dragRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !source) return
    canvas.width = source.width
    canvas.height = source.height
    const context = canvas.getContext("2d")
    if (!context) return
    context.drawImage(source.canvas, 0, 0)

    if (crop) {
      context.fillStyle = "rgba(30, 36, 32, 0.45)"
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
      context.strokeStyle = "#3d7351"
      context.lineWidth = 2
      context.strokeRect(crop.x, crop.y, crop.width, crop.height)
    }

    if (found) {
      context.lineWidth = 2
      context.font = "bold 14px sans-serif"
      found.analysis.regions.forEach((region, index) => {
        const x = found.crop.x + region.rect.x
        const y = found.crop.y + region.rect.y
        context.fillStyle = "rgba(61, 115, 81, 0.28)"
        context.strokeStyle = "#3d7351"
        context.fillRect(x, y, region.rect.width, region.rect.height)
        context.strokeRect(x, y, region.rect.width, region.rect.height)
        context.fillStyle = "#1e2420"
        context.fillText(String(index + 1), x + 6, y + 18)
      })
    }
  }, [source, crop, found])

  function reset() {
    setFound(null)
    setError("")
    if (source) setStatus("ready")
  }

  async function chooseFile(file: File | undefined) {
    if (!file) return
    setError("")
    setFound(null)
    setCrop(null)
    if (!acceptedTypes.includes(file.type)) {
      setError("PNG, JPG, WebP 이미지를 올려 주세요.")
      return
    }
    if (file.size > maxBytes) {
      setError("15MB 이하의 이미지를 올려 주세요.")
      return
    }
    setStatus("loading")
    try {
      const next = await loadImage(file)
      const pixels = pixelsOf(next, fullCrop(next))
      setWarnings(
        pixels ? diagnosePlan(pixels.data, next.width, next.height) : []
      )
      setSource(next)
      setStatus("ready")
    } catch (reason) {
      setSource(null)
      setStatus("empty")
      setError(
        reason instanceof Error ? reason.message : "이미지를 읽지 못했습니다."
      )
    }
  }

  function findRooms() {
    if (!source) return
    setStatus("analyzing")
    setError("")
    setTimeout(() => {
      const region = crop ?? fullCrop(source)
      const pixels = pixelsOf(source, region)
      if (!pixels) {
        setStatus("failed")
        setError("이미지를 읽지 못했습니다.")
        return
      }
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
      const draft = planToDraft(analysis, area)
      if (!draft.rooms.length) {
        setFound(null)
        setStatus("failed")
        setError(
          "방을 찾지 못했습니다. 도면 부분만 드래그해서 다시 찾거나, 평수로 직접 만들어 주세요."
        )
        return
      }
      setFound({ draft, analysis, crop: region })
      setStatus("found")
    }, 30)
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
    if (found) reset()
  }

  function endCrop() {
    dragRef.current = null
    setCrop((current) =>
      current && (current.width < 40 || current.height < 40) ? null : current
    )
  }

  const busy = status === "loading" || status === "analyzing"

  return (
    <div className="plan-import" role="dialog" aria-label="도면으로 시작하기">
      <header className="plan-import-header">
        <div>
          <strong>도면으로 시작하기</strong>
          <span>도면을 읽어 방 배치 초안을 만듭니다.</span>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="도면 가져오기 닫기"
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </header>

      <div className="plan-import-body">
        <aside className="plan-import-guide">
          <strong>이런 도면이 잘 인식됩니다</strong>
          <ul>
            <li>벽이 검게 칠해진 흑백 선 도면</li>
            <li>도면 한 장만 담긴 이미지</li>
            <li>가로 800px 이상</li>
          </ul>
          <strong>평수는 전용면적으로</strong>
          <ul>
            <li>도면 전체를 이 넓이에 맞춰 키우거나 줄입니다</li>
            <li>
              34평형처럼 부르는 공급면적을 넣으면 방이 크게 나옵니다. 34평형은
              전용 약 25평입니다
            </li>
          </ul>
          <strong>정확도가 떨어지는 경우</strong>
          <ul>
            <li>바닥에 색이나 무늬가 들어간 도면</li>
            <li>투시도나 면적표가 함께 있는 분양 안내 페이지</li>
            <li>사진으로 찍거나 손으로 그린 도면</li>
          </ul>
          <p>
            결과는 초안입니다. 방이 더 나뉘어 나오면 벽 지우기로 합치고, 덜
            나뉘면 쪼개기로 나눠 주세요.
          </p>
        </aside>

        <div className="plan-import-main">
          <div className="plan-import-controls">
            <label className="plan-import-file">
              <FileImage size={14} />
              {source ? "다른 도면 고르기" : "도면 이미지 고르기"}
              <input
                type="file"
                accept={acceptedTypes.join(",")}
                disabled={busy}
                onChange={(event) => {
                  void chooseFile(event.target.files?.[0])
                  event.target.value = ""
                }}
              />
            </label>
            <label title="34평형 아파트의 전용면적은 약 25평입니다">
              전용면적 (평)
              <input
                type="number"
                min={5}
                max={100}
                step={1}
                value={area}
                disabled={busy}
                onChange={(event) => {
                  setArea(Number(event.target.value))
                  if (found) reset()
                }}
              />
            </label>
            {crop && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setCrop(null)
                  if (found) reset()
                }}
              >
                영역 지우기
              </button>
            )}
            <button
              type="button"
              className="plan-import-primary"
              disabled={!source || busy}
              onClick={findRooms}
            >
              {status === "analyzing" ? (
                <LoaderCircle size={14} className="spin" />
              ) : (
                <ScanSearch size={14} />
              )}
              {status === "analyzing" ? "찾는 중" : "방 찾기"}
            </button>
          </div>

          {warnings.map((warning) => (
            <p key={warning} className="plan-import-warning">
              {warningText[warning]}
            </p>
          ))}
          {error && (
            <p className="plan-import-error" role="alert">
              {error}
            </p>
          )}

          <div className="plan-import-stage">
            {source ? (
              <canvas
                ref={canvasRef}
                aria-label="도면 미리보기. 드래그해서 도면 영역을 지정합니다."
                onPointerDown={startCrop}
                onPointerMove={moveCrop}
                onPointerUp={endCrop}
                onPointerCancel={endCrop}
              />
            ) : (
              <p className="plan-import-empty">
                {status === "loading"
                  ? "도면을 불러오는 중입니다."
                  : "도면 이미지를 고르면 여기에 표시됩니다. 도면이 페이지 일부만 차지하면 그 부분만 드래그해서 지정하세요."}
              </p>
            )}
          </div>

          <footer className="plan-import-footer">
            <span>
              {found
                ? `방 ${found.draft.rooms.length}개를 찾았습니다.`
                : source
                  ? `${source.name} · ${crop ? `선택 영역 ${crop.width}×${crop.height}px` : `${source.width}×${source.height}px`}`
                  : ""}
            </span>
            <div>
              <button type="button" onClick={onClose}>
                취소
              </button>
              <button
                type="button"
                className="plan-import-primary"
                disabled={!found}
                onClick={() => found && onImport(found.draft, clampArea(area))}
              >
                이 배치로 시작
              </button>
            </div>
          </footer>
        </div>
      </div>
    </div>
  )
}
