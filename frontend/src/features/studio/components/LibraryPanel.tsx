import type { CSSProperties, RefObject } from "react"
import {
  AlertCircle,
  Armchair,
  Box,
  Check,
  CircleHelp,
  FileImage,
  FileUp,
  Layers3,
  LoaderCircle,
  Plus,
  RefreshCw,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { catalog } from "@/features/studio/data"
import type { Category, Project } from "@/features/studio/types"

import { FurnitureIcon } from "./FurnitureIcon"

const categories: Category[] = ["전체", "소파", "테이블", "의자", "장식"]
const money = new Intl.NumberFormat("ko-KR")

export type UploadAttempt = {
  file: File
  status: "PROCESSING" | "FAILED"
  phase: "UPLOADING" | "CONVERTING"
  progress: number
  error: string
  retryable: boolean
}

type FloorPlanStatus = Project["floorPlan"]["status"]

function FurnitureLibrary({
  category,
  onCategoryChange,
  onAddFurniture,
}: {
  category: Category
  onCategoryChange: (category: Category) => void
  onAddFurniture: (catalogId: string) => void
}) {
  return (
    <>
      <div className="library-heading">
        <h2>공간에 더할 것들</h2>
        <p>가구를 선택해 방에 배치해 보세요.</p>
      </div>
      <div className="category-list" aria-label="가구 종류">
        {categories.map((entry) => (
          <button
            key={entry}
            className={category === entry ? "active" : ""}
            aria-pressed={category === entry}
            onClick={() => onCategoryChange(entry)}
          >
            {entry}
          </button>
        ))}
      </div>
      <div className="catalog-grid">
        {catalog
          .filter((item) => category === "전체" || item.category === category)
          .map((item) => (
            <button
              className="catalog-card"
              key={item.id}
              onClick={() => onAddFurniture(item.id)}
            >
              <div
                className="catalog-visual"
                style={{ "--item-color": item.color } as CSSProperties}
              >
                <FurnitureIcon category={item.category} size={46} />
                <span className="add-icon">
                  <Plus size={14} />
                </span>
              </div>
              <strong>{item.name}</strong>
              <span>{item.description}</span>
              <div className="catalog-meta">
                <span>
                  {Math.round(item.width * 100)} ×{" "}
                  {Math.round(item.depth * 100)}
                  cm
                </span>
                <b>₩{money.format(item.price)}</b>
              </div>
            </button>
          ))}
      </div>
      <div className="library-footnote">
        <Box size={14} />
        <span>
          규격 기반 기본 모델입니다.
          <br />
          실제 제품 모델은 추후 연결됩니다.
        </span>
      </div>
    </>
  )
}

function FloorPlanPanel({
  project,
  uploadAttempt,
  uploadRef,
  busy,
  onRetry,
}: {
  project: Project
  uploadAttempt: UploadAttempt | null
  uploadRef: RefObject<HTMLInputElement | null>
  busy: boolean
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
          ? "방을 만들었습니다. 자동 벽 인식은 AI 변환기 연결 후 사용할 수 있습니다."
          : "PDF, PNG, JPG 형식의 15MB 이하 도면을 선택해 주세요."

  return (
    <div className="plan-panel">
      <div className="library-heading">
        <h2>도면에서 시작하기</h2>
        <p>평면도를 올리고 내 공간의 뼈대를 만드세요.</p>
      </div>
      <button
        className="upload-zone"
        onClick={() => uploadRef.current?.click()}
        disabled={busy}
      >
        <span className="upload-icon">
          <FileUp size={26} />
        </span>
        <strong>
          {status === "FAILED" ? "다른 도면 선택" : "도면 업로드"}
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
      <div
        className={`conversion-card ${status.toLowerCase()}`}
        aria-live="polite"
      >
        <div>
          <span className="small-label">3D 변환</span>
          <Badge variant="outline">{statusLabel}</Badge>
        </div>
        <div
          className="progress-track"
          role="progressbar"
          aria-label="도면 처리 진행률"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <span style={{ width: `${progress}%` }} />
        </div>
        <p role={status === "FAILED" ? "alert" : undefined}>{message}</p>
        {status === "FAILED" && uploadAttempt?.retryable && (
          <Button
            type="button"
            variant="outline"
            className="retry-upload"
            onClick={onRetry}
            disabled={busy}
          >
            <RefreshCw size={14} />
            같은 파일 다시 시도
          </Button>
        )}
      </div>
      <h3>공간 치수</h3>
      <div className="room-dimensions">
        {Object.entries(project.dimensions).map(([key, value]) => (
          <div key={key}>
            <span>
              {key === "width" ? "가로" : key === "depth" ? "세로" : "높이"}
            </span>
            <strong>
              {value.toFixed(1)}
              <small>m</small>
            </strong>
          </div>
        ))}
      </div>
      <div className="tip-card">
        <CircleHelp size={17} />
        <p>
          치수가 표기된 도면을 사용하면 실제 공간에 가까운 모델을 만들 수
          있습니다.
        </p>
      </div>
    </div>
  )
}

export function LibraryPanel({
  tab,
  category,
  project,
  uploadAttempt,
  uploadRef,
  busy,
  onTabChange,
  onCategoryChange,
  onAddFurniture,
  onRetryUpload,
}: {
  tab: "furniture" | "plan"
  category: Category
  project: Project
  uploadAttempt: UploadAttempt | null
  uploadRef: RefObject<HTMLInputElement | null>
  busy: boolean
  onTabChange: (tab: "furniture" | "plan") => void
  onCategoryChange: (category: Category) => void
  onAddFurniture: (catalogId: string) => void
  onRetryUpload: () => void
}) {
  return (
    <aside className="library-panel">
      <div className="panel-tabs" role="tablist" aria-label="소스 선택">
        <button
          role="tab"
          aria-selected={tab === "furniture"}
          className={tab === "furniture" ? "active" : ""}
          onClick={() => onTabChange("furniture")}
        >
          <Armchair size={16} />
          가구 라이브러리
        </button>
        <button
          role="tab"
          aria-selected={tab === "plan"}
          className={tab === "plan" ? "active" : ""}
          onClick={() => onTabChange("plan")}
        >
          <Layers3 size={16} />
          도면
        </button>
      </div>
      {tab === "furniture" ? (
        <FurnitureLibrary
          category={category}
          onCategoryChange={onCategoryChange}
          onAddFurniture={onAddFurniture}
        />
      ) : (
        <FloorPlanPanel
          project={project}
          uploadAttempt={uploadAttempt}
          uploadRef={uploadRef}
          busy={busy}
          onRetry={onRetryUpload}
        />
      )}
    </aside>
  )
}
