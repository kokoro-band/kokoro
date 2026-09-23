import { useRef, useState } from "react"

import { Snackbar } from "@seed-design/react"

import { AppHeader } from "@/features/studio/components/AppHeader"
import { AssistantPanel } from "@/features/studio/components/AssistantPanel"
import { LibraryPanel } from "@/features/studio/components/LibraryPanel"
import { NewProjectDialog } from "@/features/studio/components/NewProjectDialog"
import { ProjectBar } from "@/features/studio/components/ProjectBar"
import { ProjectStartup } from "@/features/studio/components/ProjectStartup"
import { SceneEditor } from "@/features/studio/components/SceneEditor"
import { useStudioController } from "@/features/studio/hooks/useStudioController"

export default function App() {
  const studio = useStudioController()
  const uploadRef = useRef<HTMLInputElement>(null)
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const isBusy = studio.busy !== null
  const openNewProject = () => setNewProjectOpen(true)

  return (
    <div className="studio-app">
      <AppHeader onCreate={openNewProject} />
      <main id="workspace" className="workspace">
        {studio.projectLoad.status !== "ready" ? (
          <ProjectStartup
            state={studio.projectLoad}
            onRetry={studio.retryProjectLoad}
            onCreate={openNewProject}
          />
        ) : (
          <>
            <ProjectBar
              project={studio.project}
              saving={studio.saving}
              dirty={studio.dirty}
              saveBusy={studio.busy === "save"}
              onOpenSample={studio.openSampleProject}
              onExport={studio.exportProject}
              onSave={studio.saveProject}
            />
            <div
              className={`editor-grid ${!studio.showLibrary ? "left-hidden" : ""}`}
            >
              {studio.showLibrary && (
                <LibraryPanel
                  tab={studio.leftTab}
                  category={studio.category}
                  project={studio.project}
                  uploadAttempt={studio.uploadAttempt}
                  uploadRef={uploadRef}
                  busy={isBusy}
                  onTabChange={studio.setLeftTab}
                  onCategoryChange={studio.setCategory}
                  onAddFurniture={studio.addFurniture}
                  onRetryUpload={studio.retryUpload}
                />
              )}
              <SceneEditor
                project={studio.project}
                selectedId={studio.selectedId}
                mode={studio.mode}
                showLibrary={studio.showLibrary}
                canUndo={studio.canUndo}
                canRedo={studio.canRedo}
                onToggleLibrary={studio.toggleLibrary}
                onModeChange={studio.setMode}
                onUndo={studio.undo}
                onRedo={studio.redo}
                onFullscreenError={studio.reportFullscreenError}
                onSelect={studio.selectFurniture}
                onMove={studio.moveFurniture}
                onMoveEnd={studio.saveMovedFurniture}
              />
              <AssistantPanel
                messages={studio.messages}
                input={studio.input}
                chatBusy={studio.busy === "chat"}
                busy={isBusy}
                selected={studio.selected}
                onInputChange={studio.setInput}
                onSend={studio.sendMessage}
                onUpdateSelected={studio.updateSelected}
                onDeleteSelected={studio.deleteSelected}
              />
            </div>
          </>
        )}
      </main>
      <Snackbar.RootProvider>
        <Snackbar.Region>
          {studio.notice && (
            <Snackbar.Root>
              <Snackbar.Content>
                <Snackbar.Message>{studio.notice}</Snackbar.Message>
                <Snackbar.ActionButton onClick={studio.dismissNotice}>
                  닫기
                </Snackbar.ActionButton>
                <Snackbar.HiddenCloseButton onClick={studio.dismissNotice} />
              </Snackbar.Content>
            </Snackbar.Root>
          )}
        </Snackbar.Region>
      </Snackbar.RootProvider>
      <input
        ref={uploadRef}
        className="sr-only"
        type="file"
        accept="application/pdf,image/png,image/jpeg"
        onChange={(event) => {
          studio.uploadFloorPlan(event.target.files?.[0])
          event.target.value = ""
        }}
      />
      <NewProjectDialog
        open={newProjectOpen}
        onOpenChange={setNewProjectOpen}
        busy={isBusy}
        onSubmit={studio.createProject}
      />
    </div>
  )
}
