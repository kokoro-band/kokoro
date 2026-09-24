import type { RefObject } from "react"
import { Armchair, Layers3 } from "lucide-react"
import { Tabs } from "@seed-design/react"

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
      <Tabs.Root
        className="panel-tabs"
        value={tab}
        onValueChange={(value) => onTabChange(value as typeof tab)}
        triggerLayout="fill"
      >
        <Tabs.List aria-label="소스 선택">
          <Tabs.Trigger value="furniture">
            <Armchair size={16} />
            가구 라이브러리
          </Tabs.Trigger>
          <Tabs.Trigger value="plan">
            <Layers3 size={16} />
            도면
          </Tabs.Trigger>
          <Tabs.Indicator />
        </Tabs.List>
      </Tabs.Root>
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
