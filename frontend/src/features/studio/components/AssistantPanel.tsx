import type { FormEvent, KeyboardEvent } from "react"
import { LoaderCircle, Send } from "lucide-react"
import { ActionButton, Icon, TextField } from "@seed-design/react"

import { isServerMode } from "@/features/studio/project-api"
import type { ChatMessage } from "@/features/studio/types"

const suggestions = ["미니멀한 거실로 꾸며줘", "창가에 의자를 옮겨줘"]

export function AssistantPanel({
  messages,
  input,
  chatBusy,
  busy,
  onInputChange,
  onSend,
}: {
  messages: ChatMessage[]
  input: string
  chatBusy: boolean
  busy: boolean
  onInputChange: (input: string) => void
  onSend: (text: string) => void
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSend(input)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      onSend(input)
    }
  }

  return (
    <aside className="assistant-panel">
      <div className="assistant-heading">
        <h2>배치 요청</h2>
        <span>{isServerMode ? "Spring 배치 처리기" : "규칙 기반 데모"}</span>
      </div>
      <div className="chat-messages" aria-live="polite">
        {messages.map((message) => (
          <div key={message.id} className={`chat-message ${message.role}`}>
            <p>{message.text}</p>
          </div>
        ))}
        {chatBusy && (
          <div className="chat-pending">
            <LoaderCircle size={15} className="spin" />
            배치를 생각하고 있어요
          </div>
        )}
      </div>
      <div className="prompt-suggestions">
        {suggestions.map((text) => (
          <ActionButton
            key={text}
            variant="neutralOutline"
            size="small"
            onClick={() => onSend(text)}
            disabled={busy}
          >
            {text}
          </ActionButton>
        ))}
      </div>
      <form className="chat-form" onSubmit={submit}>
        <label className="sr-only" htmlFor="chat-input">
          가구 배치 요청
        </label>
        <TextField.Root className="chat-input" size="responsive">
          <TextField.Textarea
            id="chat-input"
            aria-label="가구 배치 요청"
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            placeholder="예: 소파 옆에 화분을 놓아줘"
            onKeyDown={handleKeyDown}
          />
          <ActionButton
            className="chat-send"
            type="submit"
            variant="brandSolid"
            size="small"
            layout="iconOnly"
            aria-label="배치 요청 보내기"
            disabled={!input.trim() || busy}
          >
            <Icon svg={<Send />} size="x4" />
          </ActionButton>
        </TextField.Root>
      </form>
    </aside>
  )
}
