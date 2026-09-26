import {
  useEffect,
  useRef,
  type FormEvent,
  type KeyboardEvent,
  type Ref,
} from "react"
import { IconPaperplaneTiltedFill } from "@karrotmarket/react-monochrome-icon"
import { ActionButton, Badge, Chip, Icon, ScrollFog } from "@seed-design/react"
import { ProgressCircle } from "seed-design/ui/progress-circle"
import { TextField, TextFieldTextarea } from "seed-design/ui/text-field"

import { Type } from "@/components/kokoro/Type"
import { isServerMode } from "@/features/studio/project-api"
import type { ChatMessage } from "@/features/studio/types"

const suggestions = [
  "미니멀한 거실로 꾸며줘",
  "창가에 의자를 옮겨줘",
  "소파 옆에 화분을 놓아줘",
]

export function AssistantPanel({
  messages,
  input,
  roomName,
  chatBusy,
  busy,
  onInputChange,
  onSend,
  inputRef,
  autoFocus = false,
}: {
  messages: ChatMessage[]
  input: string
  roomName: string | null
  chatBusy: boolean
  busy: boolean
  onInputChange: (input: string) => void
  onSend: (text: string) => void
  inputRef?: Ref<HTMLTextAreaElement>
  /** 모바일 시트처럼 패널을 열자마자 입력하게 할 때 */
  autoFocus?: boolean
}) {
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const log = logRef.current
    if (log) log.scrollTop = log.scrollHeight
  }, [messages.length, chatBusy])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSend(input)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault()
      onSend(input)
    }
  }

  return (
    <div className="assistant">
      <div className="assistant-context">
        <Type variant="caption">
          {roomName
            ? `${roomName}에 놓을 가구를 요청해요`
            : "집 전체에 가구를 요청해요"}
        </Type>
        <Badge
          tone={isServerMode ? "informative" : "neutral"}
          variant="weak"
          size="medium"
        >
          {isServerMode ? "서버 배치" : "규칙 기반 데모"}
        </Badge>
      </div>
      <div className="assistant-log" ref={logRef} aria-live="polite">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`assistant-message is-${message.role}`}
          >
            <Type variant="body" as="p">
              {message.text}
            </Type>
          </div>
        ))}
        {chatBusy && (
          <div className="assistant-message is-assistant loading-row">
            <ProgressCircle size="24" />
            <Type variant="description">배치를 고민하고 있어요</Type>
          </div>
        )}
      </div>
      <ScrollFog
        placement={["left", "right"]}
        hideScrollBar
        className="assistant-suggestions"
      >
        <div className="assistant-suggestions-row" aria-label="요청 예시">
          {suggestions.map((text) => (
            <Chip.Root
              key={text}
              variant="outlineWeak"
              size="small"
              disabled={busy}
              onClick={() => onSend(text)}
            >
              <Chip.Label>{text}</Chip.Label>
            </Chip.Root>
          ))}
        </div>
      </ScrollFog>
      <form className="assistant-form" onSubmit={submit}>
        <TextField
          size="medium"
          value={input}
          onValueChange={({ value }) => onInputChange(value)}
        >
          <TextFieldTextarea
            ref={inputRef}
            aria-label="가구 배치 요청"
            placeholder="예: 소파 옆에 화분을 놓아줘"
            autoresize
            autoFocus={autoFocus}
            onKeyDown={handleKeyDown}
          />
        </TextField>
        <ActionButton
          type="submit"
          variant="neutralSolid"
          size="medium"
          layout="iconOnly"
          aria-label="요청 보내기"
          disabled={!input.trim() || busy}
        >
          <Icon svg={<IconPaperplaneTiltedFill />} size="x5" />
        </ActionButton>
      </form>
    </div>
  )
}
