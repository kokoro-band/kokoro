import type { RefObject } from "react"
import { Armchair, Layers3 } from "lucide-react"

import type { Category, Project, UploadAttempt } from "@/features/studio/types"

import { FloorPlanPanel } from "./FloorPlanPanel"
import { FurnitureLibrary } from "./FurnitureLibrary"

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
