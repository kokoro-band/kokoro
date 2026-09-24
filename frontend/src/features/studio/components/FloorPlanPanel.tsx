import type { RefObject } from "react"
import {
  AlertCircle,
  Check,
  FileImage,
  FileUp,
  LoaderCircle,
  RefreshCw,
} from "lucide-react"
import { ActionButton } from "@seed-design/react"

import type { Project, UploadAttempt } from "@/features/studio/types"

type FloorPlanStatus = Project["floorPlan"]["status"]

export function FloorPlanPanel({
  project,
  uploadAttempt,
  uploadRef,
  busy,
  hideHeading = false,
  onRetry,
}: {
  project: Project
  uploadAttempt: UploadAttempt | null
  uploadRef: RefObject<HTMLInputElement | null>
  busy: boolean
  hideHeading?: boolean
  onRetry: () => void
}) {
  const displayedFloorPlan = uploadAttempt
    ? { fileName: uploadAttempt.file.name, size: uploadAttempt.file.size }
    : project.floorPlan
  const status: FloorPlanStatus =
    uploadAttempt?.status ?? project.floorPlan.status
  const progress = uploadAttempt?.progress ?? project.floorPlan.progress
  const statusLabel =
    status === "PROCESSING"
      ? uploadAttempt?.phase === "UPLOADING"
        ? "업로드 중"
        : "변환 중"
      : status === "READY"
        ? "예제 모델 준비됨"
        : status === "FAILED"
          ? "처리 실패"
          : "도면 대기"
  const message =
    status === "FAILED"
      ? (uploadAttempt?.error ??
        "도면을 처리하지 못했습니다. 다른 파일을 선택해 주세요.")
      : status === "PROCESSING"
        ? uploadAttempt?.phase === "UPLOADING"
          ? "도면을 안전하게 업로드하고 있습니다."
          : "방 치수를 적용하고 있습니다."
        : status === "READY"
          ? "현재는 예제 치수로 공간을 표시합니다."
          : "PDF, PNG, JPG 형식의 15MB 이하 도면을 선택해 주세요."

  return (
    <div className="plan-panel">
      {!hideHeading && (
        <div className="library-heading">
          <h2>도면</h2>
        </div>
      )}
      <button
        className="upload-zone"
        onClick={() => uploadRef.current?.click()}
        disabled={busy}
      >
        <FileUp size={24} />
        <strong>
          {status === "READY"
            ? "다른 도면 업로드"
            : status === "FAILED"
              ? "다른 도면 선택"
              : "도면을 올려 공간 시작하기"}
        </strong>
        <span>PDF, PNG, JPG 형식, 최대 15MB</span>
      </button>
      {displayedFloorPlan.fileName && (
        <div className={`uploaded-file ${status.toLowerCase()}`}>
          <FileImage size={20} />
          <div>
            <strong>{displayedFloorPlan.fileName}</strong>
            <span>{(displayedFloorPlan.size / 1024).toFixed(0)} KB</span>
          </div>
          {status === "PROCESSING" ? (
            <LoaderCircle className="spin" size={16} />
          ) : status === "FAILED" ? (
            <AlertCircle size={16} />
          ) : (
            <Check size={16} />
          )}
        </div>
      )}
      <div className={`plan-status ${status.toLowerCase()}`} aria-live="polite">
        <div>
          <span className="small-label">도면 상태</span>
          <strong className="status-label">{statusLabel}</strong>
        </div>
        <div
          className="progress-track"
          role="progressbar"
          aria-label="도면 처리 진행률"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <span style={{ transform: `scaleX(${progress / 100})` }} />
        </div>
        <p role={status === "FAILED" ? "alert" : undefined}>{message}</p>
        {status === "FAILED" && uploadAttempt?.retryable && (
          <ActionButton
            type="button"
            variant="neutralOutline"
            size="small"
            className="retry-upload"
            onClick={onRetry}
            disabled={busy}
          >
            <RefreshCw size={14} />
            같은 파일 다시 시도
          </ActionButton>
        )}
      </div>
      <div className="room-dimensions">
        <span>공간 치수</span>
        <strong>
          {project.dimensions.width.toFixed(1)} ×{" "}
          {project.dimensions.depth.toFixed(1)} ×{" "}
          {project.dimensions.height.toFixed(1)} m
        </strong>
      </div>
    </div>
  )
}
