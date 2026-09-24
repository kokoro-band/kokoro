import { useCallback, useRef, useState } from "react"
import { Armchair, SlidersHorizontal, Sparkles, Trash2, X } from "lucide-react"

import { ActionButton, BottomSheet, Snackbar, Tabs } from "@seed-design/react"

import { AppHeader } from "@/features/studio/components/AppHeader"
import { AssistantPanel } from "@/features/studio/components/AssistantPanel"
import { FloorPlanDialog } from "@/features/studio/components/FloorPlanDialog"
import { LibraryPanel } from "@/features/studio/components/LibraryPanel"
import { NewProjectDialog } from "@/features/studio/components/NewProjectDialog"
import { ProjectBar } from "@/features/studio/components/ProjectBar"
import { ProjectStartup } from "@/features/studio/components/ProjectStartup"
import { PropertiesPanel } from "@/features/studio/components/PropertiesPanel"
import { SceneEditor } from "@/features/studio/components/SceneEditor"
import { SelectionPanel } from "@/features/studio/components/SelectionPanel"
import { useStudioController } from "@/features/studio/hooks/useStudioController"
import { useMediaQuery } from "@/lib/use-media-query"

export default function App() {
  const studio = useStudioController()
  const uploadRef = useRef<HTMLInputElement>(null)
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const [floorPlanOpen, setFloorPlanOpen] = useState(false)
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [mobilePanel, setMobilePanel] = useState<
    "library" | "assistant" | "selection" | null
  >(null)
  const isMobile = useMediaQuery("(max-width: 820px)")
  const isBusy = studio.busy !== null
  const selectStudioFurniture = studio.selectFurniture
  const openNewProject = () => setNewProjectOpen(true)
  const rightPanel = assistantOpen
    ? "assistant"
    : studio.selected
      ? "selection"
      : null
  const selectFurniture = useCallback(
    (id: string | null) => {
      if (id) setAssistantOpen(false)
      if (isMobile) setMobilePanel(id ? "selection" : null)
      selectStudioFurniture(id)
    },
    [isMobile, selectStudioFurniture]
  )
  const addFurniture = (catalogId: string) => {
    setAssistantOpen(false)
    studio.addFurniture(catalogId)
  }

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
              onOpenFloorPlan={() => setFloorPlanOpen(true)}
              onExport={studio.exportProject}
              onSave={studio.saveProject}
            />
            <div
              className={`editor-grid ${!studio.showLibrary ? "left-hidden" : ""} ${rightPanel ? "right-open" : ""}`}
            >
              {!isMobile && studio.showLibrary && (
                <LibraryPanel
                  tab={studio.leftTab}
                  category={studio.category}
                  furniture={studio.project.furniture}
                  selectedId={studio.selectedId}
                  onTabChange={studio.setLeftTab}
                  onCategoryChange={studio.setCategory}
                  onAddFurniture={addFurniture}
                  onSelectFurniture={selectFurniture}
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
                onSelect={selectFurniture}
                onMove={studio.moveFurniture}
                onMoveEnd={studio.saveMovedFurniture}
                onApplyRoom={studio.applyRoom}
              />
              {!isMobile && (
                <aside className="right-rail" aria-label="공간 도구">
                  <Tabs.Root
                    className="right-rail-tabs"
                    value={assistantOpen ? "assistant" : "selection"}
                    onValueChange={(value) =>
                      setAssistantOpen(value === "assistant")
                    }
                    triggerLayout="fill"
                    size="small"
                  >
                    <Tabs.List aria-label="오른쪽 도구">
                      <Tabs.Trigger value="selection">
                        <SlidersHorizontal size={15} /> 가구 편집
                      </Tabs.Trigger>
                      <Tabs.Trigger value="assistant">
                        <Sparkles size={15} /> AI 도움
                      </Tabs.Trigger>
                      <Tabs.Indicator />
                    </Tabs.List>
                  </Tabs.Root>
                  {assistantOpen ? (
                    <AssistantPanel
                      messages={studio.messages}
                      input={studio.input}
                      chatBusy={studio.busy === "chat"}
                      busy={isBusy}
                      onInputChange={studio.setInput}
                      onSend={studio.sendMessage}
                    />
                  ) : studio.selected ? (
                    <SelectionPanel
                      selected={studio.selected}
                      bounds={studio.roomBounds}
                      onUpdate={studio.updateSelected}
                      onDelete={studio.deleteSelected}
                      onClose={() => selectFurniture(null)}
                    />
                  ) : (
                    <div className="selection-placeholder">
                      <p>
                        가구를 선택하면 여기서 위치와 회전을 조절할 수 있어요.
                      </p>
                    </div>
                  )}
                </aside>
              )}
            </div>
            <nav className="mobile-dock" aria-label="편집 도구">
              <ActionButton
                variant="neutralWeak"
                size="medium"
                onClick={() => setMobilePanel("library")}
              >
                <Armchair size={18} /> 가구
              </ActionButton>
              <ActionButton
                variant="neutralWeak"
                size="medium"
                onClick={() => setMobilePanel("assistant")}
              >
                <Sparkles size={18} /> AI 도움
              </ActionButton>
              {studio.selected && (
                <ActionButton
                  variant="neutralOutline"
                  size="medium"
                  onClick={() => setMobilePanel("selection")}
                >
                  <SlidersHorizontal size={18} /> 가구 편집
                </ActionButton>
              )}
            </nav>
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
      <BottomSheet.Root
        open={isMobile && mobilePanel !== null}
        onOpenChange={(open) => {
          if (!open) setMobilePanel(null)
        }}
      >
        <BottomSheet.Backdrop />
        <BottomSheet.Positioner>
          <BottomSheet.Content
            className={`mobile-panel ${mobilePanel === "selection" ? "mobile-panel-selection" : ""}`}
          >
            <BottomSheet.Header>
              <BottomSheet.Title>
                {mobilePanel === "library"
                  ? "가구"
                  : mobilePanel === "assistant"
                    ? "공간 어시스턴트"
                    : "선택한 가구"}
              </BottomSheet.Title>
              <BottomSheet.CloseButton aria-label="닫기">
                <X size={18} />
              </BottomSheet.CloseButton>
            </BottomSheet.Header>
            <BottomSheet.Body className="mobile-panel-body">
              {mobilePanel === "library" && (
                <LibraryPanel
                  tab={studio.leftTab}
                  category={studio.category}
                  furniture={studio.project.furniture}
                  selectedId={studio.selectedId}
                  onTabChange={studio.setLeftTab}
                  onCategoryChange={studio.setCategory}
                  onAddFurniture={(catalogId) => {
                    addFurniture(catalogId)
                    setMobilePanel("selection")
                  }}
                  onSelectFurniture={(id) => {
                    selectFurniture(id)
                  }}
                />
              )}
              {mobilePanel === "assistant" && (
                <AssistantPanel
                  messages={studio.messages}
                  input={studio.input}
                  chatBusy={studio.busy === "chat"}
                  busy={isBusy}
                  onInputChange={studio.setInput}
                  onSend={studio.sendMessage}
                />
              )}
              {mobilePanel === "selection" && (
                <PropertiesPanel
                  selected={studio.selected}
                  bounds={studio.roomBounds}
                  onUpdate={studio.updateSelected}
                />
              )}
              {mobilePanel === "selection" && studio.selected && (
                <ActionButton
                  className="mobile-delete-button"
                  variant="ghost"
                  size="medium"
                  onClick={() => {
                    studio.deleteSelected()
                    setMobilePanel(null)
                  }}
                >
                  <Trash2 size={16} /> 가구 삭제
                </ActionButton>
              )}
            </BottomSheet.Body>
          </BottomSheet.Content>
        </BottomSheet.Positioner>
      </BottomSheet.Root>
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
        onSubmit={async (name) => {
          const created = await studio.createProject(name)
          if (created) setFloorPlanOpen(true)
          return created
        }}
      />
      <FloorPlanDialog
        open={floorPlanOpen}
        project={studio.project}
        uploadAttempt={studio.uploadAttempt}
        uploadRef={uploadRef}
        busy={isBusy}
        onOpenChange={setFloorPlanOpen}
        onRetry={studio.retryUpload}
      />
    </div>
  )
}
