import { useState } from "react"
import { TextField, TextFieldInput } from "seed-design/ui/text-field"

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value * 10) / 10))
}

/**
 * 소수 한 자리 치수를 입력받는 필드입니다. 입력하는 동안에는 글자를 그대로 두고
 * 포커스를 떠나거나 Enter를 누를 때 값을 확정해서 "4."처럼 쓰는 중간 상태를 지킵니다.
 */
export function MeterField({
  label,
  value,
  min = 0,
  max,
  suffix = "m",
  step = 0.1,
  onCommit,
}: {
  label: string
  value: number
  min?: number
  max: number
  suffix?: string
  step?: number
  onCommit: (value: number) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? (step >= 1 ? String(value) : value.toFixed(1))

  function commit() {
    if (draft === null) return
    const parsed = Number(draft.replace(",", "."))
    setDraft(null)
    if (!Number.isFinite(parsed) || draft.trim() === "") return
    const next = clamp(parsed, min, max)
    if (next !== value) onCommit(next)
  }

  return (
    <TextField
      label={label}
      size="medium"
      suffix={suffix}
      value={shown}
      onValueChange={({ value: next }) => setDraft(next)}
    >
      <TextFieldInput
        inputMode="decimal"
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit()
          if (event.key === "Escape") setDraft(null)
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault()
            const base = Number(shown)
            if (!Number.isFinite(base)) return
            const next = clamp(
              base + (event.key === "ArrowUp" ? step : -step),
              min,
              max
            )
            setDraft(null)
            onCommit(next)
          }
        }}
      />
    </TextField>
  )
}
