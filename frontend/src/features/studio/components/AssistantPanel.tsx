import type { FormEvent, KeyboardEvent } from "react"
import {
  ArrowRight,
  CircleHelp,
  LoaderCircle,
  Send,
  Sparkles,
} from "lucide-react"

import { isServerMode } from "@/features/studio/project-api"
import type { ChatMessage, Furniture } from "@/features/studio/types"

import { PropertiesPanel } from "./PropertiesPanel"

const suggestions = ["미니멀한 거실로 꾸며줘", "창가에 의자를 옮겨줘"]

export function AssistantPanel({
  messages,
  input,
  chatBusy,
  busy,
  selected,
  bounds,
  onInputChange,
  onSend,
  onUpdateSelected,
  onDeleteSelected,
}: {
  messages: ChatMessage[]
  input: string
  chatBusy: boolean
  busy: boolean
  selected?: Furniture
  bounds: { width: number; depth: number }
  onInputChange: (input: string) => void
  onSend: (text: string) => void
  onUpdateSelected: (update: Partial<Furniture>) => void
  onDeleteSelected: () => void
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
        <div className="assistant-symbol">
          <Sparkles size={20} />
        </div>
        <div>
          <h2>공간 어시스턴트</h2>
          <span>말로 시작하고 손으로 완성해요</span>
        </div>
        <button
          className="icon-button"
          title="현재는 규칙 기반 배치 데모입니다"
          aria-label="어시스턴트 정보"
        >
          <CircleHelp size={16} />
        </button>
      </div>
      <div className="chat-messages" aria-live="polite">
        {messages.map((message) => (
          <div key={message.id} className={`chat-message ${message.role}`}>
            {message.role === "assistant" && (
              <span className="chat-avatar">
                <Sparkles size={13} />
              </span>
            )}
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
          <button key={text} onClick={() => onSend(text)} disabled={busy}>
            {text}
            <ArrowRight size={12} />
          </button>
        ))}
      </div>
      <form className="chat-form" onSubmit={submit}>
        <label className="sr-only" htmlFor="chat-input">
          가구 배치 요청
        </label>
        <textarea
          id="chat-input"
          rows={2}
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          placeholder="예: 소파 옆에 화분을 놓아줘"
          onKeyDown={handleKeyDown}
        />
        <div>
          <span>
            <Sparkles size={12} />
            {isServerMode ? "Spring 배치 처리기" : "규칙 기반 배치 데모"}
          </span>
          <button
            type="submit"
            aria-label="배치 요청 보내기"
            disabled={!input.trim() || busy}
          >
            <Send size={16} />
          </button>
        </div>
      </form>
      <PropertiesPanel
        selected={selected}
        bounds={bounds}
        onUpdate={onUpdateSelected}
        onDelete={onDeleteSelected}
      />
    </aside>
  )
}
