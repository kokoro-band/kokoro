import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react"
import { IconXmarkLine } from "@karrotmarket/react-monochrome-icon"
import {
  ActionButton,
  ContentDialog,
  Icon,
  ResponsivePair,
} from "@seed-design/react"
import { Callout } from "seed-design/ui/callout"
import {
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectRoot,
  SelectTrigger,
} from "seed-design/ui/select"
import { TextField, TextFieldInput } from "seed-design/ui/text-field"

import { Type } from "@/components/kokoro/Type"
import {
  boxFromDrag,
  makeCustomFurniture,
  maxSideCm,
  measurePhoto,
  minSideCm,
  type MeasuredSize,
  type PhotoBox,
} from "@/features/studio/photo-measure"
import type { Furniture } from "@/features/studio/types"

import { MeterField } from "./MeterField"

const categories: Furniture["category"][] = [
  "기타",
  "소파",
  "테이블",
  "의자",
  "장식",
]

type Step = "pick" | "box" | "measuring" | "result"

const photoTips = [
  "가구 위에 올려 둔 물건은 치워 주세요.",
  "바닥이 같이 보이게 찍어 주세요.",
  "정면보다 모서리 쪽에서, 가구 전체가 들어오게 찍어 주세요.",
  "메신저로 보내면 사진이 압축돼요. 케이블이나 원본 전송으로 옮겨 주세요.",
]

/**
 * 휴대폰으로 찍은 가구 사진으로 크기를 재서 가구를 추가합니다.
 * 고른 파일은 그대로 측정 서버로 보내고, 측정값은 사용자가 고친 뒤 추가합니다.
 */
export function PhotoFurnitureDialog({
  open,
  onOpenChange,
  onAdd,
  measure = measurePhoto,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (item: Furniture) => void
  measure?: typeof measurePhoto
}) {
  const [step, setStep] = useState<Step>("pick")
  const [photo, setPhoto] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [box, setBox] = useState<PhotoBox | null>(null)
  const [drag, setDrag] = useState<{
    start: [number, number]
    end: [number, number]
    frame: DOMRect
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [measured, setMeasured] = useState<MeasuredSize | null>(null)
  const [size, setSize] = useState({ width: 0, depth: 0, height: 0 })
  const [name, setName] = useState("내 가구")
  const [category, setCategory] = useState<Furniture["category"]>("기타")
  const fileRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const pending = useRef<AbortController | null>(null)

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview)
    },
    [preview]
  )
  useEffect(() => () => pending.current?.abort(), [])

  function reset() {
    pending.current?.abort()
    pending.current = null
    setStep("pick")
    setPhoto(null)
    setPreview(null)
    setBox(null)
    setDrag(null)
    setError(null)
    setMeasured(null)
    setName("내 가구")
    setCategory("기타")
  }

  function close(next: boolean) {
    if (!next) reset()
    onOpenChange(next)
  }

  function pick(file: File | undefined) {
    if (!file) return
    setError(null)
    setBox(null)
    setMeasured(null)
    setPhoto(file)
    setPreview(URL.createObjectURL(file))
    setStep("box")
  }

  const point = (event: ReactPointerEvent): [number, number] => [
    event.clientX,
    event.clientY,
  ]
  function startDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const frame = imageRef.current?.getBoundingClientRect()
    if (step !== "box" || !frame) return
    event.currentTarget.setPointerCapture?.(event.pointerId)
    setDrag({ start: point(event), end: point(event), frame })
  }
  function moveDrag(event: ReactPointerEvent) {
    if (drag) setDrag({ ...drag, end: point(event) })
  }
  function endDrag(event: ReactPointerEvent) {
    if (!drag) return
    const next = boxFromDrag(drag.start, point(event), drag.frame)
    setDrag(null)
    setBox(next)
    setError(
      next ? null : "가구 전체를 감싸도록 사진 위를 끌어서 상자를 그려 주세요."
    )
  }

  async function run() {
    if (!photo || !box) return
    const controller = new AbortController()
    pending.current = controller
    setStep("measuring")
    setError(null)
    try {
      const result = await measure(photo, box, { signal: controller.signal })
      if (controller.signal.aborted) return
      setMeasured(result)
      setSize({
        width: Math.round(result.widthCm),
        depth: Math.round(result.depthCm),
        height: Math.round(result.heightCm),
      })
      setStep("result")
    } catch (caught) {
      if (controller.signal.aborted) return
      setError(
        caught instanceof Error
          ? caught.message
          : "측정하지 못했어요. 다시 시도해 주세요."
      )
      setStep("box")
    } finally {
      if (pending.current === controller) pending.current = null
    }
  }

  function add() {
    try {
      onAdd(
        makeCustomFurniture({
          name,
          category,
          widthCm: size.width,
          depthCm: size.depth,
          heightCm: size.height,
        })
      )
      close(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }

  const shownBox = (() => {
    if (!drag) return box
    const { frame } = drag
    const [x0, y0] = drag.start
    const [x1, y1] = drag.end
    const unit = (value: number) => Math.min(1, Math.max(0, value))
    return [
      unit((Math.min(x0, x1) - frame.left) / frame.width),
      unit((Math.min(y0, y1) - frame.top) / frame.height),
      unit((Math.max(x0, x1) - frame.left) / frame.width),
      unit((Math.max(y0, y1) - frame.top) / frame.height),
    ] as PhotoBox
  })()

  const pickButton = (
    <ActionButton
      variant={photo ? "neutralWeak" : "neutralSolid"}
      size="medium"
      disabled={step === "measuring"}
      onClick={() => fileRef.current?.click()}
    >
      {photo ? "다른 사진 고르기" : "사진 고르기"}
    </ActionButton>
  )

  return (
    <ContentDialog.Root open={open} onOpenChange={close}>
      <ContentDialog.Backdrop />
      <ContentDialog.Positioner>
        <ContentDialog.Content className="photo-furniture-dialog">
          <ContentDialog.Header>
            <ContentDialog.Title>사진으로 가구 추가</ContentDialog.Title>
            <ContentDialog.Description>
              {step === "result"
                ? "사진으로 추정한 값이라 ±20% 정도 틀릴 수 있어요. 줄자로 잰 값이 있으면 고쳐 주세요."
                : step === "pick"
                  ? "휴대폰으로 찍은 가구 사진을 PC로 옮겨 원본 그대로 골라 주세요."
                  : "사진 위를 끌어서 가구 전체를 감싸는 상자를 그려 주세요."}
            </ContentDialog.Description>
            <ContentDialog.CloseButton aria-label="닫기">
              <Icon svg={<IconXmarkLine />} size="x5" />
            </ContentDialog.CloseButton>
          </ContentDialog.Header>
          <ContentDialog.Body className="photo-furniture-body">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              aria-label="가구 사진 파일"
              onChange={(event) => {
                pick(event.currentTarget.files?.[0])
                event.currentTarget.value = ""
              }}
            />
            {step === "pick" && (
              <ul className="photo-tips">
                {photoTips.map((tip) => (
                  <li key={tip}>
                    <Type variant="description">{tip}</Type>
                  </li>
                ))}
              </ul>
            )}
            {preview && step !== "result" && (
              <div
                className="photo-frame"
                data-drawing={step === "box" || undefined}
                onPointerDown={startDrag}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
              >
                <img
                  ref={imageRef}
                  src={preview}
                  alt="고른 가구 사진"
                  draggable={false}
                />
                {shownBox && (
                  <span
                    className="photo-box"
                    aria-hidden="true"
                    style={{
                      left: `${shownBox[0] * 100}%`,
                      top: `${shownBox[1] * 100}%`,
                      width: `${(shownBox[2] - shownBox[0]) * 100}%`,
                      height: `${(shownBox[3] - shownBox[1]) * 100}%`,
                    }}
                  />
                )}
              </div>
            )}
            {step === "measuring" && (
              <Type variant="description" as="p" role="status">
                크기를 재고 있어요. 10초쯤 걸려요.
              </Type>
            )}
            {step === "result" && measured && (
              <div className="photo-result">
                {!measured.floorFound && (
                  <Callout
                    tone="warning"
                    description="바닥이 잘 보이지 않아 높이가 덜 정확할 수 있어요."
                  />
                )}
                <TextField
                  label="이름"
                  size="medium"
                  value={name}
                  onValueChange={({ value }) => setName(value)}
                >
                  <TextFieldInput maxLength={200} />
                </TextField>
                <SelectRoot
                  label="종류"
                  size="medium"
                  value={[category]}
                  onValueChange={([value]) => {
                    if (value) setCategory(value as Furniture["category"])
                  }}
                >
                  <SelectTrigger />
                  <SelectContent>
                    <SelectGroup>
                      {categories.map((entry) => (
                        <SelectItem key={entry} value={entry} label={entry} />
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </SelectRoot>
                <div className="photo-size-fields">
                  {(
                    [
                      ["width", "가로"],
                      ["depth", "세로"],
                      ["height", "높이"],
                    ] as const
                  ).map(([key, label]) => (
                    <MeterField
                      key={key}
                      label={label}
                      value={size[key]}
                      min={minSideCm}
                      max={maxSideCm}
                      suffix="cm"
                      step={1}
                      precision={0}
                      onCommit={(value) =>
                        setSize((current) => ({ ...current, [key]: value }))
                      }
                    />
                  ))}
                </div>
              </div>
            )}
            {error && <Callout tone="critical" description={error} />}
          </ContentDialog.Body>
          <ContentDialog.Footer>
            {step === "result" ? (
              <ResponsivePair gap="x2">
                <ActionButton
                  variant="neutralWeak"
                  size="medium"
                  onClick={() => {
                    setError(null)
                    setStep("box")
                  }}
                >
                  다시 재기
                </ActionButton>
                <ActionButton
                  variant="neutralSolid"
                  size="medium"
                  onClick={add}
                >
                  추가하기
                </ActionButton>
              </ResponsivePair>
            ) : photo ? (
              <ResponsivePair gap="x2">
                {pickButton}
                <ActionButton
                  variant="neutralSolid"
                  size="medium"
                  disabled={!box}
                  loading={step === "measuring"}
                  onClick={() => void run()}
                >
                  크기 재기
                </ActionButton>
              </ResponsivePair>
            ) : (
              pickButton
            )}
          </ContentDialog.Footer>
        </ContentDialog.Content>
      </ContentDialog.Positioner>
    </ContentDialog.Root>
  )
}
