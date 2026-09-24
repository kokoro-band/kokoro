import type { RefObject } from "react"
import { X } from "lucide-react"
import { ContentDialog } from "@seed-design/react"

import type { Project, UploadAttempt } from "@/features/studio/types"

import { FloorPlanPanel } from "./FloorPlanPanel"

export function FloorPlanDialog({
  open,
  project,
  uploadAttempt,
  uploadRef,
  busy,
  onOpenChange,
  onRetry,
}: {
  open: boolean
  project: Project
  uploadAttempt: UploadAttempt | null
  uploadRef: RefObject<HTMLInputElement | null>
  busy: boolean
  onOpenChange: (open: boolean) => void
  onRetry: () => void
}) {
  return (
    <ContentDialog.Root open={open} onOpenChange={onOpenChange}>
      <ContentDialog.Backdrop />
      <ContentDialog.Positioner>
        <ContentDialog.Content className="floor-plan-dialog">
          <ContentDialog.Header>
            <ContentDialog.Title>도면</ContentDialog.Title>
            <ContentDialog.Description>
              등록한 도면과 현재 공간 치수를 확인하거나 다른 도면을 올릴 수
              있어요.
            </ContentDialog.Description>
            <ContentDialog.CloseButton aria-label="닫기">
              <X size={18} />
            </ContentDialog.CloseButton>
          </ContentDialog.Header>
          <ContentDialog.Body className="floor-plan-dialog-body">
            <FloorPlanPanel
              project={project}
              uploadAttempt={uploadAttempt}
              uploadRef={uploadRef}
              busy={busy}
              hideHeading
              onRetry={onRetry}
            />
          </ContentDialog.Body>
        </ContentDialog.Content>
      </ContentDialog.Positioner>
    </ContentDialog.Root>
  )
}
