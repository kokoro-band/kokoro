import { ActionButton, ContentDialog, ResponsivePair } from "@seed-design/react"
import { Type } from "@/components/kokoro/Type"

/** 로컬 데모는 프로젝트를 하나만 저장하므로 덮어쓰기 전에 내보낼 기회를 줍니다. */
export function ReplaceProjectDialog({
  open,
  projectName,
  target,
  onExport,
  onCancel,
  onConfirm,
}: {
  open: boolean
  projectName: string
  target: "sample" | "create"
  onExport: () => void
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <ContentDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel()
      }}
    >
      <ContentDialog.Backdrop />
      <ContentDialog.Positioner>
        <ContentDialog.Content>
          <ContentDialog.Header>
            <ContentDialog.Title>지금 프로젝트를 바꿀까요?</ContentDialog.Title>
            <ContentDialog.Description>
              이 브라우저에는 프로젝트를 하나만 저장해요.
            </ContentDialog.Description>
          </ContentDialog.Header>
          <ContentDialog.Body>
            <div className="replace-project-body">
              <Type variant="body" as="p">
                {`계속하면 ‘${projectName}’ 대신 ${target === "sample" ? "예제 집" : "새 프로젝트"}이 저장되고, 되돌리기로 돌아올 수 없어요. 배치 기록을 남기려면 먼저 JSON으로 내보내 두세요. 내보낸 파일은 아직 이 앱에서 다시 열 수 없어요.`}
              </Type>
              <ActionButton
                variant="neutralWeak"
                size="medium"
                onClick={onExport}
              >
                JSON으로 내보내기
              </ActionButton>
            </div>
          </ContentDialog.Body>
          <ContentDialog.Footer>
            <ResponsivePair gap="x2">
              <ActionButton
                variant="neutralWeak"
                size="medium"
                onClick={onCancel}
              >
                취소
              </ActionButton>
              <ActionButton
                variant="criticalSolid"
                size="medium"
                onClick={onConfirm}
              >
                바꾸기
              </ActionButton>
            </ResponsivePair>
          </ContentDialog.Footer>
        </ContentDialog.Content>
      </ContentDialog.Positioner>
    </ContentDialog.Root>
  )
}
