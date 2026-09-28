import { useRef, type KeyboardEvent, type ReactNode } from "react"
import { ActionButton, PrefixIcon } from "@seed-design/react"

export type ToolbarChoiceItem<T extends string> = {
  value: T
  label: string
  icon?: ReactNode
  /** 마우스를 올렸을 때 보여 줄 설명. 단축키를 알려 줄 때 씁니다. */
  title?: string
}

/**
 * 뷰포트 툴바에서 하나만 고르는 도구 묶음입니다. SEED ghost Action Button을
 * radio 그룹으로 묶고, 고른 항목은 SEED의 transparentSelected 배경으로 표시합니다.
 */
export function ToolbarChoice<T extends string>({
  items,
  value,
  onValueChange,
  size = "small",
  "aria-label": ariaLabel,
}: {
  items: ToolbarChoiceItem<T>[]
  value: T
  onValueChange: (value: T) => void
  size?: "xsmall" | "small"
  "aria-label": string
}) {
  const groupRef = useRef<HTMLDivElement>(null)

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0
    if (!step) return
    event.preventDefault()
    const index = items.findIndex((item) => item.value === value)
    const next = items[(index + step + items.length) % items.length]
    onValueChange(next.value)
    groupRef.current
      ?.querySelector<HTMLButtonElement>(`[data-value="${next.value}"]`)
      ?.focus()
  }

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label={ariaLabel}
      className="toolbar-choice"
      onKeyDown={onKeyDown}
    >
      {items.map((item) => {
        const checked = item.value === value
        return (
          <ActionButton
            key={item.value}
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            data-value={item.value}
            title={item.title}
            variant="ghost"
            size={size}
            color={checked ? "fg.neutral" : "fg.neutralMuted"}
            className="choice-button"
            onClick={() => onValueChange(item.value)}
          >
            {item.icon && <PrefixIcon svg={item.icon} />}
            {item.label}
          </ActionButton>
        )
      })}
    </div>
  )
}
