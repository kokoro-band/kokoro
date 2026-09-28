import { useEffect, useRef, useState } from "react"
import { ActionButton, ContentDialog, ResponsivePair } from "@seed-design/react"

import { Type } from "@/components/kokoro/Type"
import { catalog } from "@/features/studio/data"
import type {
  ChatCommandResponse,
  Furniture,
  LayoutCommand,
} from "@/features/studio/types"

function commandLabel(command: LayoutCommand, furniture: Furniture[]) {
  if (command.type === "CLEAR") return "모든 가구 삭제"
  const target = furniture.find((item) => item.id === command.furnitureId)
  const name =
    target?.name ??
    catalog.find((item) => item.id === command.catalogId)?.name ??
    "가구"
  switch (command.type) {
    case "ADD":
      return `${name} 추가`
    case "MOVE":
      return `${name} 이동`
    case "ROTATE":
      return `${name} 회전`
    case "REMOVE":
      return `${name} 삭제`
  }
}

export function CommandConfirmationDialog({
  response,
  furniture,
  stale,
  error,
  confirming,
  onCancel,
  onConfirm,
  onChoose,
  inputRef,
}: {
  response: ChatCommandResponse | null
  furniture: Furniture[]
  stale: boolean
  error: string | null
  confirming: boolean
  onCancel: () => void
  onConfirm: () => void
  onChoose: (furnitureId: string) => void
  inputRef: React.RefObject<HTMLTextAreaElement | null>
}) {
  const wasOpen = useRef(false)
  const [selection, setSelection] = useState<{
    response: ChatCommandResponse
    id: string
  } | null>(null)
  const selectedCandidate =
    selection?.response === response ? selection.id : null
  useEffect(() => {
    let focusTimer: number | undefined
    if (wasOpen.current && !response) {
      // SEED restores the opener after its exit animation. Move focus after that step.
      focusTimer = window.setTimeout(() => inputRef.current?.focus(), 200)
    }
    wasOpen.current = Boolean(response)
    return () => window.clearTimeout(focusTimer)
  }, [response, inputRef])

  const candidates = response?.candidates ?? []
  const commands = response?.proposedCommands ?? []
  return (
    <ContentDialog.Root
      open={Boolean(response)}
      onOpenChange={(open) => {
        if (!open && !confirming) onCancel()
      }}
    >
      <ContentDialog.Backdrop />
      <ContentDialog.Positioner>
        <ContentDialog.Content className="command-confirmation">
          <ContentDialog.Header>
            <ContentDialog.Title>
              {candidates.length ? "대상 가구 선택" : "명령 확인"}
            </ContentDialog.Title>
            <ContentDialog.Description>
              {candidates.length
                ? "변경할 가구를 고르세요."
                : "다음 동작을 적용할까요?"}
            </ContentDialog.Description>
          </ContentDialog.Header>
          <ContentDialog.Body>
            {stale || error ? (
              <Type
                variant="description"
                as="p"
                role="alert"
                color="fg.critical"
              >
                {stale
                  ? "그 사이 배치가 바뀌었어요. 닫고 명령을 다시 요청해 주세요."
                  : error}
              </Type>
            ) : null}
            {candidates.length > 0 ? (
              <div className="command-candidates">
                <Type variant="description" as="p">
                  {response?.commands
                    .map((command) =>
                      command.type === "MOVE"
                        ? "이동"
                        : command.type === "ROTATE"
                          ? "회전"
                          : command.type === "REMOVE"
                            ? "삭제"
                            : "변경"
                    )
                    .join(", ")}
                  할 가구를 선택하세요.
                </Type>
                {candidates.map((candidate) => {
                  const item = furniture.find(
                    (entry) => entry.id === candidate.furnitureId
                  )
                  return (
                    <ActionButton
                      key={candidate.furnitureId}
                      variant={
                        selectedCandidate === candidate.furnitureId
                          ? "neutralSolid"
                          : "neutralWeak"
                      }
                      size="medium"
                      disabled={stale || confirming}
                      aria-pressed={selectedCandidate === candidate.furnitureId}
                      onClick={() =>
                        response &&
                        setSelection({ response, id: candidate.furnitureId })
                      }
                    >
                      {candidate.name}
                      {item ? ` · ${item.x}m, ${item.z}m` : ""}
                    </ActionButton>
                  )
                })}
              </div>
            ) : (
              <ul className="command-preview-list">
                {commands.map((command, index) => (
                  <li key={`${command.type}-${index}`}>
                    <Type variant="body">
                      {commandLabel(command, furniture)}
                    </Type>
                  </li>
                ))}
              </ul>
            )}
            <Type variant="caption" as="p">
              적용할 내용을 확인해 주세요.
            </Type>
          </ContentDialog.Body>
          <ContentDialog.Footer>
            <ResponsivePair gap="x2">
              <ActionButton
                variant="neutralWeak"
                size="medium"
                disabled={confirming}
                onClick={onCancel}
              >
                취소
              </ActionButton>
              <ActionButton
                variant="brandSolid"
                size="medium"
                disabled={
                  stale ||
                  confirming ||
                  (candidates.length > 0
                    ? !selectedCandidate
                    : !response?.proposalId || commands.length === 0)
                }
                loading={confirming}
                onClick={() =>
                  candidates.length > 0
                    ? selectedCandidate && onChoose(selectedCandidate)
                    : onConfirm()
                }
              >
                적용
              </ActionButton>
            </ResponsivePair>
          </ContentDialog.Footer>
        </ContentDialog.Content>
      </ContentDialog.Positioner>
    </ContentDialog.Root>
  )
}
