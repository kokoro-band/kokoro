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
import { chatInputError, maxChatLength } from "../input-limits"

const ruleSuggestions = [
  "미니멀한 거실로 꾸며줘",
  "창가에 의자를 옮겨줘",
  "소파 옆에 화분을 놓아줘",
]
const webGpuSuggestions = [
  "의자를 90도 회전해줘",
  "소파 옆에 화분을 놓아줘",
  "소파를 삭제해줘",
]

export function AssistantPanel({
  messages,
  input,
  roomName,
  chatBusy,
  busy,
  engine = "rules",
  browserAiStatus = "",
  onEngineChange,
  onStopAi,
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
  engine?: "rules" | "webgpu" | "cloud"
  browserAiStatus?: string
  onEngineChange?: (engine: "rules" | "webgpu" | "cloud") => void
  onStopAi?: () => void
  onInputChange: (input: string) => void
  onSend: (text: string) => void
  inputRef?: Ref<HTMLTextAreaElement>
  /** 모바일 시트처럼 패널을 열자마자 입력하게 할 때 */
  autoFocus?: boolean
}) {
  const logRef = useRef<HTMLDivElement>(null)
  const error = chatInputError(input)

  useEffect(
    function scrollToLatestMessage() {
      const log = logRef.current
      if (log) log.scrollTop = log.scrollHeight
    },
    [messages.length, chatBusy]
  )

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!busy && !error) onSend(input)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault()
      if (!busy && !error) onSend(input)
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
          {isServerMode
            ? "서버 배치"
            : engine === "webgpu"
              ? "브라우저 AI"
              : engine === "cloud"
                ? "외부 AI"
                : "규칙 기반 데모"}
        </Badge>
      </div>
      {!isServerMode && onEngineChange && (
        <div
          className="assistant-engine"
          role="group"
          aria-label="배치 요청 방식"
        >
          <ActionButton
            type="button"
            size="small"
            variant={engine === "rules" ? "neutralSolid" : "neutralWeak"}
            disabled={busy}
            onClick={() => onEngineChange("rules")}
          >
            규칙 기반
          </ActionButton>
          <ActionButton
            type="button"
            size="small"
            variant={engine === "webgpu" ? "neutralSolid" : "neutralWeak"}
            disabled={busy}
            onClick={() => onEngineChange("webgpu")}
          >
            이 기기에서 AI 실행
          </ActionButton>
          <ActionButton
            type="button"
            size="small"
            variant={engine === "cloud" ? "neutralSolid" : "neutralWeak"}
            disabled={busy}
            onClick={() => onEngineChange("cloud")}
          >
            외부 AI로 해석
          </ActionButton>
        </div>
      )}
      {!isServerMode && engine === "webgpu" && (
        <Type variant="description" as="p" role="status">
          {browserAiStatus ||
            "첫 요청에 약 570MB 모델 파일을 다운로드합니다. 제안을 확인한 뒤 적용할 수 있어요."}
        </Type>
      )}
      {!isServerMode && engine === "cloud" && (
        <Type variant="description" as="p" role="status">
          요청 문장과 현재 가구 이름을 외부 AI 서비스에 보냅니다. 제안을 확인한
          뒤 이 브라우저에 저장합니다.
        </Type>
      )}
      {!isServerMode && engine !== "rules" && chatBusy && onStopAi && (
        <div className="assistant-stop">
          <ActionButton
            type="button"
            size="small"
            variant="neutralWeak"
            onClick={onStopAi}
          >
            모델 요청 중단
          </ActionButton>
        </div>
      )}
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
            <Type variant="description">
              {browserAiStatus || "배치를 고민하고 있어요"}
            </Type>
          </div>
        )}
      </div>
      <ScrollFog
        placement={["left", "right"]}
        hideScrollBar
        className="assistant-suggestions"
      >
        <div className="assistant-suggestions-row" aria-label="요청 예시">
          {(engine === "webgpu" ? webGpuSuggestions : ruleSuggestions).map(
            (text) => (
              <Chip.Root
                key={text}
                variant="outlineWeak"
                size="small"
                disabled={busy}
                onClick={() => onSend(text)}
              >
                <Chip.Label>{text}</Chip.Label>
              </Chip.Root>
            )
          )}
        </div>
      </ScrollFog>
      <form className="assistant-form" onSubmit={submit}>
        <TextField
          size="medium"
          value={input}
          invalid={Boolean(input && error)}
          errorMessage={input ? error : undefined}
          description={`${input.length} / ${maxChatLength}자. 이모지는 여러 자로 계산될 수 있어요.`}
          onValueChange={({ value }) => onInputChange(value)}
        >
          <TextFieldTextarea
            ref={inputRef}
            aria-label="가구 배치 요청"
            maxLength={maxChatLength}
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
          disabled={Boolean(error) || busy}
        >
          <Icon svg={<IconPaperplaneTiltedFill />} size="x5" />
        </ActionButton>
      </form>
    </div>
  )
}
