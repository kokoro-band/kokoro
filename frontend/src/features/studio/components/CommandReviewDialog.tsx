import { ActionButton, ContentDialog, ResponsivePair } from "@seed-design/react"
import { Type } from "@/components/kokoro/Type"
import { commandLayoutKey } from "../command-review"
import { catalog } from "../data"
import type { CommandReview, LayoutCommand, Project } from "../types"

function describeCommand(command: LayoutCommand, project: Project) {
  const furniture = project.furniture.find(
    (item) => item.id === command.furnitureId
  )
  const name =
    furniture?.name ??
    catalog.find((item) => item.id === command.catalogId)?.name ??
    "가구"
  switch (command.type) {
    case "CLEAR":
      return `가구 ${project.furniture.length}개 모두 삭제: ${project.furniture.map((item) => item.name).join(", ") || "없음"}`
    case "REMOVE":
      return `${name} 삭제`
    case "ADD":
      return `${name} 추가`
    case "MOVE":
      return `${name} 이동 (${command.x}, ${command.z} m)`
    case "ROTATE":
      return `${name} 회전 (${command.rotation}도)`
  }
}

export function CommandReviewDialog({
  review,
  project,
  onCancel,
  onConfirm,
  onChoose,
  onRequestAgain,
}: {
  review: CommandReview | null
  project: Project
  onCancel: () => void
  onConfirm: () => void
  onChoose: (furnitureId: string) => void
  onRequestAgain: () => void
}) {
  const applying = review?.status === "applying"
  const stale =
    review?.status === "stale" ||
    Boolean(review && review.baseKey !== commandLayoutKey(project))
  const candidates = review?.response.candidates ?? []
  const choosing =
    candidates.length > 0 && !review?.response.requiresConfirmation
  return (
    <ContentDialog.Root
      open={Boolean(review)}
      onOpenChange={(open) => {
        if (!open && !applying) onCancel()
      }}
      closeOnEscape={!applying}
      closeOnInteractOutside={!applying}
    >
      <ContentDialog.Backdrop />
      <ContentDialog.Positioner>
        <ContentDialog.Content>
          <ContentDialog.Header>
            <ContentDialog.Title>
              {choosing ? "대상 가구 선택" : "배치 변경 확인"}
            </ContentDialog.Title>
            <ContentDialog.Description>
              {choosing
                ? "같은 종류의 가구가 있어요. 위치를 보고 하나를 골라 주세요."
                : "아래 변경을 적용할까요? 적용 전에는 배치가 바뀌지 않아요."}
            </ContentDialog.Description>
          </ContentDialog.Header>
          <ContentDialog.Body>
            <div className="command-review-body" aria-busy={applying}>
              <Type variant="body" as="p">
                {review?.message}
              </Type>
              {choosing ? (
                <div className="command-review-candidates">
                  {candidates.map((candidate, index) => {
                    const item = review?.response.project.furniture.find(
                      (entry) => entry.id === candidate.furnitureId
                    )
                    return (
                      <ActionButton
                        key={candidate.furnitureId}
                        variant="neutralWeak"
                        size="medium"
                        disabled={applying || stale || !item}
                        onClick={() => onChoose(candidate.furnitureId)}
                      >
                        {`${index + 1}. ${candidate.name} (${item?.x ?? "?"}, ${item?.z ?? "?"} m)`}
                      </ActionButton>
                    )
                  })}
                </div>
              ) : (
                <ul className="command-review-list">
                  {review?.response.proposedCommands.map((command, index) => (
                    <li key={index}>
                      <Type variant="body">
                        {describeCommand(command, review.response.project)}
                      </Type>
                    </li>
                  ))}
                </ul>
              )}
              {(stale || review?.error) && (
                <Type variant="body" as="p" role="alert">
                  {review?.error ||
                    "배치가 바뀌었어요. 현재 배치로 다시 요청해 주세요."}
                </Type>
              )}
              {applying && (
                <Type variant="description" as="p" role="status">
                  결과를 확인하고 있어요. 전송한 요청은 취소할 수 없어요.
                </Type>
              )}
            </div>
          </ContentDialog.Body>
          <ContentDialog.Footer>
            <ResponsivePair gap="x2">
              <ActionButton
                variant="neutralWeak"
                size="medium"
                disabled={applying}
                onClick={onCancel}
              >
                취소
              </ActionButton>
              {stale ? (
                <ActionButton
                  variant="brandSolid"
                  size="medium"
                  disabled={applying}
                  onClick={onRequestAgain}
                >
                  다시 요청
                </ActionButton>
              ) : (
                !choosing && (
                  <ActionButton
                    variant="brandSolid"
                    size="medium"
                    disabled={applying}
                    loading={applying}
                    onClick={onConfirm}
                  >
                    {review?.status === "retry"
                      ? "같은 요청 다시 확인"
                      : "변경 적용"}
                  </ActionButton>
                )
              )}
            </ResponsivePair>
          </ContentDialog.Footer>
        </ContentDialog.Content>
      </ContentDialog.Positioner>
    </ContentDialog.Root>
  )
}
