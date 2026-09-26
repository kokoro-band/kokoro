import type { RefObject } from "react"
import {
  IconArrowClockwiseCircularLine,
  IconDocumentLine,
  IconXmarkLine,
} from "@karrotmarket/react-monochrome-icon"
import {
  ActionButton,
  Badge,
  ContentDialog,
  Icon,
  PrefixIcon,
  ResponsivePair,
} from "@seed-design/react"
import { Callout } from "seed-design/ui/callout"
import { ProgressCircle } from "seed-design/ui/progress-circle"

import { Type } from "@/components/kokoro/Type"
import { isServerMode } from "@/features/studio/project-api"
import type { Project, UploadAttempt } from "@/features/studio/types"

type FloorPlanStatus = Project["floorPlan"]["status"]

const statusBadge: Record<
  FloorPlanStatus,
  { label: string; tone: "neutral" | "informative" | "positive" | "critical" }
> = {
  EMPTY: { label: "올린 도면 없음", tone: "neutral" },
  PROCESSING: { label: "처리 중", tone: "informative" },
  READY: { label: "준비됨", tone: "positive" },
  FAILED: { label: "처리 실패", tone: "critical" },
}

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
  const file = uploadAttempt
    ? { fileName: uploadAttempt.file.name, size: uploadAttempt.file.size }
    : project.floorPlan
  const status: FloorPlanStatus =
    uploadAttempt?.status ?? project.floorPlan.status
  const progress = uploadAttempt?.progress ?? project.floorPlan.progress
  const badge = statusBadge[status]
  const phase =
    uploadAttempt?.phase === "UPLOADING"
      ? "올리고 있어요"
      : "치수를 읽고 있어요"

  return (
    <ContentDialog.Root open={open} onOpenChange={onOpenChange}>
      <ContentDialog.Backdrop />
      <ContentDialog.Positioner>
        <ContentDialog.Content className="floor-plan-dialog">
          <ContentDialog.Header>
            <ContentDialog.Title>도면 파일</ContentDialog.Title>
            <ContentDialog.Description>
              프로젝트에 원본 도면을 함께 보관해요.
              {isServerMode
                ? " 서버가 파일 형식과 크기를 확인해요."
                : " 로컬 데모에서는 올리면 예제 집 구조를 보여 드려요."}
            </ContentDialog.Description>
            <ContentDialog.CloseButton aria-label="닫기">
              <Icon svg={<IconXmarkLine />} size="x5" />
            </ContentDialog.CloseButton>
          </ContentDialog.Header>
          <ContentDialog.Body className="floor-plan-body">
            <div className="floor-plan-file">
              <span className="floor-plan-file-icon" aria-hidden="true">
                {status === "PROCESSING" ? (
                  <ProgressCircle
                    size="24"
                    value={progress}
                    minValue={0}
                    maxValue={100}
                  />
                ) : (
                  <Icon svg={<IconDocumentLine />} size="x6" />
                )}
              </span>
              <div className="floor-plan-file-text">
                <Type
                  variant="label"
                  maxLines={2}
                  title={file.fileName || undefined}
                >
                  {file.fileName || "아직 올린 도면이 없어요"}
                </Type>
                <Type variant="caption" numeric>
                  {status === "PROCESSING"
                    ? `${phase} · ${progress}%`
                    : file.fileName
                      ? `${Math.max(1, Math.round(file.size / 1024))} KB`
                      : "PDF, PNG, JPG · 15MB 이하"}
                </Type>
              </div>
              <Badge tone={badge.tone} variant="weak" size="medium">
                {badge.label}
              </Badge>
            </div>

            {status === "FAILED" && (
              <Callout
                tone="critical"
                title="도면을 처리하지 못했어요"
                description={
                  uploadAttempt?.error || "다른 파일을 골라 다시 올려 주세요."
                }
              />
            )}

            <dl className="stat-list">
              <div>
                <Type variant="description" as="dt">
                  집 크기
                </Type>
                <Type variant="label" as="dd" numeric>
                  {project.room
                    ? `${project.room.bounds.width.toFixed(1)} × ${project.room.bounds.depth.toFixed(1)} m`
                    : "구조를 잡으면 표시돼요"}
                </Type>
              </div>
              <div>
                <Type variant="description" as="dt">
                  천장 높이
                </Type>
                <Type variant="label" as="dd" numeric>
                  {(
                    project.room?.wallHeight ?? project.dimensions.height
                  ).toFixed(1)}{" "}
                  m
                </Type>
              </div>
            </dl>
          </ContentDialog.Body>
          <ContentDialog.Footer>
            <ResponsivePair gap="x2">
              {status === "FAILED" && uploadAttempt?.retryable && (
                <ActionButton
                  variant="neutralWeak"
                  size="medium"
                  onClick={onRetry}
                  disabled={busy}
                >
                  <PrefixIcon svg={<IconArrowClockwiseCircularLine />} />
                  같은 파일 다시 올리기
                </ActionButton>
              )}
              <ActionButton
                variant="neutralSolid"
                size="medium"
                onClick={() => uploadRef.current?.click()}
                disabled={busy}
                loading={status === "PROCESSING" && busy}
              >
                {file.fileName ? "다른 파일 올리기" : "도면 파일 올리기"}
              </ActionButton>
            </ResponsivePair>
          </ContentDialog.Footer>
        </ContentDialog.Content>
      </ContentDialog.Positioner>
    </ContentDialog.Root>
  )
}
