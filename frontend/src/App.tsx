import { useEffect, useMemo, useRef, useState } from "react"
import {
  Snackbar,
  SnackbarProvider,
  useSnackbarAdapter,
} from "seed-design/ui/snackbar"

import { AppBar, type StudioView } from "@/features/studio/components/AppBar"
import { ArrangeView } from "@/features/studio/components/ArrangeView"
import { FloorPlanDialog } from "@/features/studio/components/FloorPlanDialog"
import { NewProjectDialog } from "@/features/studio/components/NewProjectDialog"
import { ProjectStartup } from "@/features/studio/components/ProjectStartup"
import { ShortcutGuide } from "@/features/studio/components/ShortcutGuide"
import { StructureView } from "@/features/studio/components/StructureView"
import { SummaryView } from "@/features/studio/components/SummaryView"
import {
  useStudioController,
  type Notice,
} from "@/features/studio/hooks/useStudioController"
import { useShortcut } from "@/features/studio/hooks/useShortcut"
import { useMediaQuery } from "@/lib/use-media-query"

export default function App() {
  return (
    <SnackbarProvider>
      <Studio />
    </SnackbarProvider>
  )
}

/** 컨트롤러의 알림을 SEED Snackbar 큐로 넘깁니다. */
function NoticeSnackbar({
  notice,
  onShown,
  onRetrySave,
}: {
  notice: Notice | null
  onShown: () => void
  onRetrySave: () => void
}) {
  const adapter = useSnackbarAdapter()
  const retryRef = useRef(onRetrySave)
  useEffect(() => {
    retryRef.current = onRetrySave
  }, [onRetrySave])
  useEffect(() => {
    if (!notice) return
    adapter.create({
      render: () => (
        <Snackbar
          variant={notice.tone}
          message={notice.text}
          {...(notice.action === "retrySave"
            ? { actionLabel: "다시 저장", onAction: () => retryRef.current() }
            : {})}
        />
      ),
    })
    onShown()
  }, [adapter, notice, onShown])
  return null
}

function Studio() {
  const studio = useStudioController()
  const uploadRef = useRef<HTMLInputElement>(null)
  const isMobile = useMediaQuery("(max-width: 820px)")
  const hasRooms = Boolean(studio.project.room?.rooms.length)
  const [view, setView] = useState<StudioView>(() =>
    hasRooms ? "arrange" : "structure"
  )
  const [roomIndex, setRoomIndex] = useState<number | null>(null)
  const [structureDirty, setStructureDirty] = useState(false)
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const [floorPlanOpen, setFloorPlanOpen] = useState(false)
  const [applying, setApplying] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const ready = studio.projectLoad.status === "ready"

  useShortcut("guide", () => setGuideOpen(true))
  useShortcut("viewStructure", () => setView("structure"), { enabled: ready })
  useShortcut("viewArrange", () => setView("arrange"), { enabled: ready })
  useShortcut("viewSummary", () => setView("summary"), { enabled: ready })
  // 구조 화면은 저장하지 않은 초안이 따로 있어서 구조 편집기가 저장을 맡습니다.
  useShortcut("save", studio.saveProject, {
    enabled: ready && view !== "structure",
  })

  // 저장된 구조가 바뀌면 구조 편집기를 새 기준으로 다시 시작합니다.
  const structureKey = useMemo(
    () => `${studio.project.id}:${JSON.stringify(studio.project.room ?? null)}`,
    [studio.project.id, studio.project.room]
  )

  const enterRoom = (index: number) => {
    studio.selectFurniture(null)
    setRoomIndex(index)
    setView("arrange")
  }

  const resetNavigation = (next: StudioView) => {
    setRoomIndex(null)
    setView(next)
  }

  return (
    <div className="studio-app">
      <AppBar
        projectName={studio.project.name}
        view={view}
        structureDirty={structureDirty && view !== "structure"}
        showViews={ready}
        saving={studio.saving}
        saveFailed={studio.saveFailed}
        saveBusy={studio.busy === "save"}
        onViewChange={setView}
        onSave={studio.saveProject}
        onCreateProject={() => setNewProjectOpen(true)}
        onOpenSample={() => {
          studio.openSampleProject()
          resetNavigation("arrange")
        }}
        onOpenFloorPlan={() => setFloorPlanOpen(true)}
        onExport={studio.exportProject}
        onOpenShortcuts={() => setGuideOpen(true)}
      />
      <main id="workspace" className="workspace">
        {!ready ? (
          <ProjectStartup
            state={studio.projectLoad}
            onRetry={studio.retryProjectLoad}
            onCreate={() => setNewProjectOpen(true)}
          />
        ) : (
          <>
            <div className="workspace-view" hidden={view !== "structure"}>
              <StructureView
                key={structureKey}
                room={studio.project.room}
                active={view === "structure"}
                saving={applying}
                onDirtyChange={setStructureDirty}
                onApply={(nextRoom) => {
                  setApplying(true)
                  void studio.applyRoom(nextRoom).then((saved) => {
                    setApplying(false)
                    if (saved) resetNavigation("arrange")
                  })
                }}
              />
            </div>
            {view === "arrange" && (
              <div className="workspace-view">
                <ArrangeView
                  studio={studio}
                  roomIndex={roomIndex}
                  isMobile={isMobile}
                  onRoomChange={setRoomIndex}
                  onOpenStructure={() => setView("structure")}
                />
              </div>
            )}
            {view === "summary" && (
              <div className="workspace-view workspace-scroll">
                <SummaryView
                  project={studio.project}
                  onEnterRoom={enterRoom}
                  onStartArranging={() => setView("arrange")}
                  onOpenStructure={() => setView("structure")}
                />
              </div>
            )}
          </>
        )}
      </main>
      <NoticeSnackbar
        notice={studio.notice}
        onShown={studio.dismissNotice}
        onRetrySave={studio.saveProject}
      />
      <input
        ref={uploadRef}
        className="sr-only"
        type="file"
        tabIndex={-1}
        accept="application/pdf,image/png,image/jpeg"
        onChange={(event) => {
          studio.uploadFloorPlan(event.target.files?.[0])
          event.target.value = ""
        }}
      />
      <NewProjectDialog
        open={newProjectOpen}
        onOpenChange={setNewProjectOpen}
        busy={studio.busy === "create"}
        onSubmit={async (name) => {
          const created = await studio.createProject(name)
          if (created) resetNavigation("structure")
          return created
        }}
      />
      <ShortcutGuide open={guideOpen} view={view} onOpenChange={setGuideOpen} />
      <FloorPlanDialog
        open={floorPlanOpen}
        project={studio.project}
        uploadAttempt={studio.uploadAttempt}
        uploadRef={uploadRef}
        busy={studio.busy !== null}
        onOpenChange={setFloorPlanOpen}
        onRetry={studio.retryUpload}
      />
    </div>
  )
}
