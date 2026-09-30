import { ActionButton, ContentDialog } from "@seed-design/react"
import { Type } from "@/components/kokoro/Type"
import type { ProjectConflict } from "../hooks/useStudioController"

export function ProjectConflictDialog({
  conflict,
  onLoad,
  onDiscard,
  onReapply,
  onDismiss,
}: {
  conflict: ProjectConflict | null
  onLoad: () => void
  onDiscard: () => void
  onReapply: () => void
  onDismiss: () => void
}) {
  const busy = conflict?.status !== "idle"
  return (
    <ContentDialog.Root
      open={Boolean(conflict?.open)}
      onOpenChange={(open) => {
        if (!open && !busy) onDismiss()
      }}
      closeOnEscape={!busy}
      closeOnInteractOutside={!busy}
    >
      <ContentDialog.Backdrop />
      <ContentDialog.Positioner>
        <ContentDialog.Content>
          <ContentDialog.Header>
            <ContentDialog.Title>서버 내용이 바뀌었어요</ContentDialog.Title>
            <ContentDialog.Description>
              저장을 멈추고 내 초안을 보관하고 있어요. 최신 내용을 확인한 뒤
              어떻게 이어갈지 골라 주세요.
            </ContentDialog.Description>
          </ContentDialog.Header>
          <ContentDialog.Body>
            <div className="command-review-body" aria-busy={busy}>
              {conflict?.latest && (
                <Type as="p" variant="body">
                  확인한 서버 버전 {conflict.latest.revision}. 가구{" "}
                  {conflict.latest.furniture.length}개와 방{" "}
                  {conflict.latest.room?.rooms?.length ?? 0}개가 있어요.
                </Type>
              )}
              <Type as="p" variant="description">
                내 변경을 다시 적용하면 직접 바꾼 가구는 내 내용이 우선해요.
                서버에서 삭제된 가구가 복원될 수도 있어요. 저장하지 못한 구조가
                있으면 그 구조도 적용해요.
              </Type>
              {conflict?.error && (
                <Type as="p" variant="body" role="alert">
                  {conflict.error}
                </Type>
              )}
              {busy && (
                <Type as="p" variant="description" role="status">
                  {conflict?.status === "loading"
                    ? "최신 내용을 확인하고 있어요."
                    : "변경을 적용하고 있어요. 잠시 편집을 멈춰 주세요."}
                </Type>
              )}
              <ActionButton
                variant="neutralWeak"
                size="medium"
                disabled={busy}
                onClick={onLoad}
              >
                최신 내용 확인
              </ActionButton>
              {conflict?.latest && (
                <>
                  <ActionButton
                    variant="neutralWeak"
                    size="medium"
                    disabled={busy}
                    onClick={onDiscard}
                  >
                    내 초안 버리고 서버 내용 사용
                  </ActionButton>
                  <ActionButton
                    variant="brandSolid"
                    size="medium"
                    disabled={busy}
                    onClick={onReapply}
                  >
                    내 변경을 최신 내용에 적용
                  </ActionButton>
                </>
              )}
            </div>
          </ContentDialog.Body>
          <ContentDialog.Footer>
            <ActionButton
              variant="ghost"
              size="medium"
              disabled={busy}
              onClick={onDismiss}
            >
              나중에 해결
            </ActionButton>
          </ContentDialog.Footer>
        </ContentDialog.Content>
      </ContentDialog.Positioner>
    </ContentDialog.Root>
  )
}
