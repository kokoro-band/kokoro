import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type Ref,
} from "react"
import { IconPaperplaneTiltedFill } from "@karrotmarket/react-monochrome-icon"
import { ActionButton, Badge, Chip, Icon, ScrollFog } from "@seed-design/react"
import { ProgressCircle } from "seed-design/ui/progress-circle"
import { TextField, TextFieldTextarea } from "seed-design/ui/text-field"
import { Callout } from "seed-design/ui/callout"
import type { useLocalAssistant } from "../hooks/useLocalAssistant"

import { Type } from "@/components/kokoro/Type"
import { isServerMode } from "@/features/studio/project-api"
import type { ChatMessage } from "@/features/studio/types"

const suggestions = [
  "클라우드 소파 하나 추가해줘",
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
  assistant,
  saveFailed,
  onReloadSaved,
}: {
  messages: ChatMessage[]
  input: string
  roomName: string | null
  chatBusy: boolean
  busy: boolean
  onInputChange: (input: string) => void
  onSend: (text: string) => void
  inputRef?: Ref<HTMLTextAreaElement>
  assistant?: ReturnType<typeof useLocalAssistant>
  saveFailed?: boolean
  onReloadSaved?: () => void
}) {
  const logRef = useRef<HTMLDivElement>(null)
  const [showSetup, setShowSetup] = useState(false)

  useEffect(
    function scrollToLatestAssistantState() {
      const log = logRef.current
      if (log) log.scrollTop = log.scrollHeight
    },
    [messages.length, chatBusy, assistant?.phase]
  )

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
          {isServerMode ? "내 PC의 로컬 AI" : "규칙 기반 데모"}
        </Badge>
      </div>
      <div className="assistant-log" ref={logRef} aria-live="polite">
        {isServerMode && assistant && (
          <div className="assistant-local-status">
            <Type variant="caption">{assistant.modelStatus}</Type>
            <ActionButton
              variant="ghost"
              size="small"
              onClick={() => setShowSetup(!showSetup)}
              aria-expanded={showSetup}
            >
              로컬 모델 설정 안내
            </ActionButton>
            {showSetup && (
              <div className="assistant-setup">
                <Type variant="description" as="p">
                  내 PC에 Ollama를 설치하고 아래 명령으로 모델을 받아 주세요.
                  추론은 내 PC에서 실행하며 도면 원본과 인증 정보는 보내지
                  않아요.
                </Type>
                <pre>
                  <code>ollama pull qwen3:4b</code>
                </pre>
                <Type variant="description" as="p">
                  Ollama 서버가 실행 중이어야 해요. 연결이 막히면
                  OLLAMA_ORIGINS에 현재 웹 주소만 허용하고 다시 시작해 주세요.
                </Type>
                <Type variant="caption">
                  현재 웹 주소: {window.location.origin}
                </Type>
              </div>
            )}
          </div>
        )}
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
              {isServerMode
                ? "내 PC에서 명령을 해석하고 있어요"
                : "배치를 만들고 있어요"}
            </Type>
          </div>
        )}
        {isServerMode && assistant?.error && (
          <Callout
            tone="critical"
            title="요청을 마치지 못했어요"
            description={assistant.error}
          />
        )}
        {isServerMode && assistant?.phase === "choice" && assistant.choice && (
          <div className="assistant-proposal">
            <Type variant="heading">{assistant.choice.detail}</Type>
            {assistant.choice.candidates.map((candidate) => (
              <ActionButton
                key={candidate.id}
                variant="neutralWeak"
                size="medium"
                onClick={() => void assistant.choose(candidate.id)}
              >
                {candidate.name}
              </ActionButton>
            ))}
            <ActionButton
              variant="ghost"
              size="medium"
              onClick={() => void assistant.act("cancel")}
            >
              요청 취소
            </ActionButton>
          </div>
        )}
        {isServerMode &&
          assistant?.phase === "preview" &&
          assistant.proposal && (
            <div className="assistant-proposal">
              <Type variant="heading">배치 미리보기</Type>
              <Type variant="description" as="p">
                화면의 배치는 아직 저장되지 않았어요. 확인하면 아래 변경을
                적용해요.
              </Type>
              <ul>
                {assistant.proposal.actions.map((action, index) => (
                  <li key={`${index}-${action}`}>
                    <Type variant="body">{action}</Type>
                  </li>
                ))}
              </ul>
              <div className="assistant-actions">
                <ActionButton
                  variant="neutralWeak"
                  size="medium"
                  onClick={() => void assistant.act("cancel")}
                >
                  취소
                </ActionButton>
                <ActionButton
                  variant="brandSolid"
                  size="medium"
                  onClick={() => void assistant.act("confirm")}
                >
                  확인하고 저장
                </ActionButton>
              </div>
              <Type variant="caption">
                다른 편집을 하려면 먼저 확인하거나 취소해 주세요. 제안은 5분 뒤
                만료돼요.
              </Type>
            </div>
          )}
        {isServerMode && assistant?.phase === "saving" && (
          <Type variant="description">서버 처리 결과를 확인하고 있어요.</Type>
        )}
        {isServerMode && assistant?.phase === "recover" && (
          <div className="assistant-proposal">
            <Type variant="description">
              이전 요청의 처리 상태를 먼저 확인해 주세요. 중복으로 배치하지
              않아요.
            </Type>
            <ActionButton
              variant="brandSolid"
              size="medium"
              onClick={() => void assistant.act("recover")}
            >
              처리 상태 확인
            </ActionButton>
          </div>
        )}
        {isServerMode &&
          !assistant?.locked &&
          (saveFailed || assistant?.error) && (
            <ActionButton
              variant="neutralWeak"
              size="medium"
              onClick={onReloadSaved}
            >
              초안을 버리고 서버 저장본 불러오기
            </ActionButton>
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
          disabled={busy}
          value={input}
          onValueChange={({ value }) => onInputChange(value)}
        >
          <TextFieldTextarea
            ref={inputRef}
            aria-label="가구 배치 요청"
            placeholder="예: 소파 옆에 화분을 놓아줘"
            autoresize
            maxLength={2000}
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
