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

/** Sends controller notices to the SEED Snackbar queue. */
function NoticeSnackbar({
  notice,
  onShown,
  onRetrySave,
  onRestoreSaved,
}: {
  notice: Notice | null
  onShown: () => void
  onRetrySave: () => void
  onRestoreSaved: () => void
}) {
  const adapter = useSnackbarAdapter()
  const retryRef = useRef(onRetrySave)
  const restoreRef = useRef(onRestoreSaved)
  useEffect(() => {
    retryRef.current = onRetrySave
    restoreRef.current = onRestoreSaved
  }, [onRetrySave, onRestoreSaved])
  useEffect(() => {
    if (!notice) return
    adapter.create({
      render: () => (
        <Snackbar
          variant={notice.tone}
          message={notice.text}
          {...(notice.action === "retrySave"
            ? { actionLabel: "다시 저장", onAction: () => retryRef.current() }
            : notice.action === "restoreSaved"
              ? {
                  actionLabel: "되돌리기",
                  onAction: () => restoreRef.current(),
                }
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
  // The structure editor owns saving because its unsaved draft is separate.
  useShortcut("save", studio.saveProject, {
    enabled: ready && view !== "structure",
  })

  // Restart the structure editor when the saved structure changes.
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
        dirty={studio.dirty}
        saving={studio.saving}
        saveFailed={studio.saveFailed}
        saveRejected={studio.saveRejected}
        saveBusy={studio.busy === "save"}
        onViewChange={setView}
        onSave={studio.saveProject}
        onRestoreSaved={studio.restoreSavedProject}
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
        onRestoreSaved={studio.restoreSavedProject}
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
