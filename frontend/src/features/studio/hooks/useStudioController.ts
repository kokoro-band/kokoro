import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useRef, useState } from "react"

import { initialMessages, sampleProject } from "@/features/studio/data"
import {
  isServerMode,
  getProject,
  makeFurniture,
  readActiveProjectId,
  readSavedProject,
  rememberActiveProject,
} from "@/features/studio/project-api"
import {
  createProjectMutationOptions,
  projectQueryOptions,
  saveProjectMutationOptions,
  saveRoomMutationOptions,
  sendCommandMutationOptions,
  uploadPlanMutationOptions,
} from "@/features/studio/project-queries"
import { withObjectParticle } from "@/features/studio/format"
import { useLocalAssistant } from "./useLocalAssistant"
import { projectKeys } from "@/features/studio/project-queries"
import type {
  RoomModel,
  Category,
  ChatMessage,
  Furniture,
  Point2,
  Project,
  ProjectLoadState,
  UploadAttempt,
  ViewMode,
} from "@/features/studio/types"

export type Notice = {
  id: number
  text: string
  tone: "default" | "positive" | "critical"
  /** 저장 실패처럼 알림 안에서 바로 다시 시도할 수 있을 때 */
  action?: "retrySave"
}

/** 다른 알림이 없던 시간이 이만큼 지나야 자동 저장을 알립니다. */
const autosaveNoticeQuietMs = 45_000

const maxFloorPlanBytes = 15 * 1024 * 1024
const supportedFloorPlanTypes = ["application/pdf", "image/png", "image/jpeg"]

function validateFloorPlan(file: File) {
  if (!supportedFloorPlanTypes.includes(file.type))
    return "PDF, PNG, JPG 파일만 올릴 수 있어요."
  if (file.size > maxFloorPlanBytes) return "15MB 이하의 파일만 올릴 수 있어요."
  if (file.size === 0) return "비어 있는 파일이에요. 다른 파일을 골라 주세요."
  return null
}

function round(value: number) {
  return Math.round(value * 10) / 10
}

export function useStudioController() {
  const [project, setProject] = useState<Project>(readSavedProject)
  const [projectLoad, setProjectLoad] = useState<ProjectLoadState>(
    isServerMode
      ? { status: "loading", message: "" }
      : { status: "ready", message: "" }
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mode, setMode] = useState<ViewMode>("3d")
  const [category, setCategory] = useState<Category>("전체")
  const [leftTab, setLeftTab] = useState<"furniture" | "placed">("furniture")
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [input, setInput] = useState("")
  const [notice, setNoticeState] = useState<Notice | null>(null)
  const noticeIdRef = useRef(0)
  const lastNoticeAtRef = useRef(0)
  const setNotice = useCallback(function setNotice(
    text: string,
    tone: Notice["tone"] = "default",
    action?: Notice["action"]
  ) {
    if (text) lastNoticeAtRef.current = Date.now()
    setNoticeState(
      text ? { id: (noticeIdRef.current += 1), text, tone, action } : null
    )
  }, [])
  const [busy, setBusy] = useState<
    "chat" | "save" | "upload" | "create" | "room" | null
  >(null)
  const [uploadAttempt, setUploadAttempt] = useState<UploadAttempt | null>(null)
  const [past, setPast] = useState<Furniture[][]>([])
  const [future, setFuture] = useState<Furniture[][]>([])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)

  const queryClient = useQueryClient()
  const createProjectMutation = useMutation(
    createProjectMutationOptions(queryClient)
  )
  const saveProjectMutation = useMutation(
    saveProjectMutationOptions(queryClient, project.id)
  )
  const saveRoomMutation = useMutation(
    saveRoomMutationOptions(queryClient, project.id)
  )
  const uploadPlanMutation = useMutation(
    uploadPlanMutationOptions(queryClient, project.id)
  )
  const sendCommandMutation = useMutation(
    sendCommandMutationOptions(queryClient, project.id)
  )

  const activeProjectIdRef = useRef(readActiveProjectId() ?? sampleProject.id)
  const startedInitialLoadRef = useRef(false)
  const projectRef = useRef(project)
  const queuedSaveRef = useRef<Project | null>(null)
  const saveLoopRef = useRef<Promise<void> | null>(null)
  const saveProjectAsyncRef = useRef(saveProjectMutation.mutateAsync)
  const transientBaseRef = useRef<Furniture[] | null>(null)
  const operationRef = useRef(false)
  const assistantLockedRef = useRef(false)
  const saveErrorRef = useRef<unknown>(null)
  const revisionsRef = useRef<Record<string, number>>({})
  const loadGenerationRef = useRef(0)

  const selected = project.furniture.find((item) => item.id === selectedId)
  const roomBounds = project.room?.bounds ?? {
    width: project.dimensions.width,
    depth: project.dimensions.depth,
  }

  const dismissNotice = useCallback(() => setNotice(""), [setNotice])

  // 서버 모드는 서버에, 로컬 데모는 이 브라우저에 자동으로 저장합니다.
  const queueSave = useCallback(
    function queueSave(snapshot: Project) {
      queuedSaveRef.current = snapshot
      if (saveLoopRef.current) return

      saveLoopRef.current = (async () => {
        setSaving(true)
        let failed = false
        try {
          while (queuedSaveRef.current) {
            const next = queuedSaveRef.current
            queuedSaveRef.current = null
            try {
              const saved = await saveProjectAsyncRef.current({
                ...next,
                revision: revisionsRef.current[next.id] ?? next.revision,
              })
              if (saved.revision !== undefined)
                revisionsRef.current[saved.id] = saved.revision
              saveErrorRef.current = null
              if (projectRef.current.id !== next.id) continue
              setSaveFailed(false)
              if (projectRef.current.furniture === next.furniture) {
                projectRef.current = saved
                setProject(saved)
                setDirty(false)
              } else {
                const latest = {
                  ...projectRef.current,
                  revision: saved.revision,
                }
                projectRef.current = latest
                setProject(latest)
              }
            } catch (error) {
              failed = true
              saveErrorRef.current = error
              queuedSaveRef.current = null
              setDirty(true)
              setSaveFailed(true)
              setNotice(
                error instanceof Error
                  ? error.message
                  : "자동으로 저장하지 못했어요.",
                "critical",
                "retrySave"
              )
            }
          }
          // 저장은 조용히 하고, 한동안 다른 알림이 없었을 때만 저장됐다고 알려 줍니다.
          if (
            !failed &&
            Date.now() - lastNoticeAtRef.current > autosaveNoticeQuietMs
          ) {
            setNotice("자동으로 저장했어요.", "positive")
          }
        } finally {
          saveLoopRef.current = null
          setSaving(false)
        }
      })()
    },
    [setNotice]
  )

  /** 서버를 거치지 않고 바뀐 프로젝트를 로컬 데모에서만 저장합니다. */
  const persistLocalChange = useCallback(
    function persistLocalChange(snapshot: Project) {
      if (isServerMode) return
      setDirty(true)
      queueSave(snapshot)
    },
    [queueSave]
  )

  const loadServerProject = useCallback(
    async function loadServerProject(projectId: string) {
      const generation = ++loadGenerationRef.current
      activeProjectIdRef.current = projectId
      setProjectLoad({ status: "loading", message: "" })
      try {
        const loaded = await queryClient.fetchQuery({
          ...projectQueryOptions(projectId),
          staleTime: 0,
        })
        if (
          activeProjectIdRef.current !== projectId ||
          generation !== loadGenerationRef.current
        )
          return
        if (loaded.revision !== undefined)
          revisionsRef.current[loaded.id] = loaded.revision
        saveErrorRef.current = null
        setSaveFailed(false)
        rememberActiveProject(loaded.id)
        projectRef.current = loaded
        setProject(loaded)
        setSelectedId(null)
        setPast([])
        setFuture([])
        setUploadAttempt(null)
        setDirty(false)
        setProjectLoad({ status: "ready", message: "" })
      } catch (error) {
        if (
          activeProjectIdRef.current !== projectId ||
          generation !== loadGenerationRef.current
        )
          return
        setProjectLoad({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "프로젝트를 불러오지 못했어요.",
        })
      }
    },
    [queryClient]
  )

  useEffect(
    function synchronizeSaveMutation() {
      saveProjectAsyncRef.current = saveProjectMutation.mutateAsync
    },
    [saveProjectMutation.mutateAsync]
  )

  useEffect(
    function loadInitialServerProject() {
      if (!isServerMode || startedInitialLoadRef.current) return
      startedInitialLoadRef.current = true
      void loadServerProject(activeProjectIdRef.current)
    },
    [loadServerProject]
  )

  function commitFurniture(next: Furniture[]) {
    if (operationRef.current || assistantLockedRef.current) return
    const updated = { ...projectRef.current, furniture: next }
    setPast((history) => [...history.slice(-29), project.furniture])
    setFuture([])
    projectRef.current = updated
    setProject(updated)
    setDirty(true)
    queueSave(updated)
  }

  const selectFurniture = useCallback(function selectFurniture(
    id: string | null
  ) {
    setSelectedId(id)
  }, [])

  const previewFurniture = useCallback(function previewFurniture(
    id: string,
    update: Partial<Furniture>
  ) {
    if (operationRef.current || assistantLockedRef.current) return
    transientBaseRef.current ??= projectRef.current.furniture
    const updated = {
      ...projectRef.current,
      furniture: projectRef.current.furniture.map((item) =>
        item.id === id ? { ...item, ...update } : item
      ),
    }
    projectRef.current = updated
    setProject(updated)
    setDirty(true)
  }, [])

  const moveFurniture = useCallback(
    function moveFurniture(id: string, x: number, z: number) {
      previewFurniture(id, { x, z })
    },
    [previewFurniture]
  )

  const commitPreview = useCallback(
    function commitPreview() {
      const base = transientBaseRef.current
      transientBaseRef.current = null
      if (!base || base === projectRef.current.furniture) return
      setPast((history) => [...history.slice(-29), base])
      setFuture([])
      queueSave(projectRef.current)
    },
    [queueSave]
  )

  function updateSelected(update: Partial<Furniture>) {
    if (operationRef.current || assistantLockedRef.current) return
    commitFurniture(
      project.furniture.map((item) =>
        item.id === selectedId ? { ...item, ...update } : item
      )
    )
  }

  function deleteSelected() {
    if (operationRef.current || assistantLockedRef.current) return
    commitFurniture(project.furniture.filter((item) => item.id !== selectedId))
    setSelectedId(null)
  }

  function addFurniture(catalogId: string, position?: [number, number]) {
    if (operationRef.current || assistantLockedRef.current) return
    const step = project.furniture.length
    const item = makeFurniture(
      catalogId,
      position
        ? round(position[0])
        : round(roomBounds.width * 0.4 + ((step * 0.6) % 1.8)),
      position
        ? round(position[1])
        : round(roomBounds.depth * 0.45 + ((step * 0.4) % 1.2))
    )
    commitFurniture([...project.furniture, item])
    setSelectedId(item.id)
    setNotice(`${withObjectParticle(item.name)} 놓았어요.`)
  }

  function undo() {
    if (operationRef.current || assistantLockedRef.current) return
    const previous = past.at(-1)
    if (!previous) return
    setFuture((history) => [project.furniture, ...history])
    setPast((history) => history.slice(0, -1))
    const updated = { ...projectRef.current, furniture: previous }
    projectRef.current = updated
    setProject(updated)
    setDirty(true)
    queueSave(updated)
  }

  function redo() {
    if (operationRef.current || assistantLockedRef.current) return
    const next = future[0]
    if (!next) return
    setPast((history) => [...history, project.furniture])
    setFuture((history) => history.slice(1))
    const updated = { ...projectRef.current, furniture: next }
    projectRef.current = updated
    setProject(updated)
    setDirty(true)
    queueSave(updated)
  }

  async function handleSave() {
    if (operationRef.current || assistantLockedRef.current) return
    commitPreview()
    operationRef.current = true
    setBusy("save")
    try {
      await saveLoopRef.current
      queueSave(projectRef.current)
      await saveLoopRef.current
      if (saveErrorRef.current) throw saveErrorRef.current
      setNotice(
        isServerMode ? "저장했어요." : "이 브라우저에 저장했어요.",
        "positive"
      )
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "저장하지 못했어요.",
        "critical",
        "retrySave"
      )
    } finally {
      operationRef.current = false
      setBusy(null)
    }
  }

  async function handleChat(
    text: string,
    focus?: Point2[],
    focusRoomName?: string
  ) {
    if (!text.trim() || operationRef.current || assistantLockedRef.current)
      return
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", text },
    ])
    setInput("")
    if (isServerMode) {
      await assistant.send(text, selectedId, focusRoomName)
      return
    }
    operationRef.current = true
    setBusy("chat")
    try {
      const response = await sendCommandMutation.mutateAsync({
        project,
        message: text,
        focus,
      })
      setPast((history) => [...history.slice(-29), project.furniture])
      setFuture([])
      projectRef.current = response.project
      setProject(response.project)
      persistLocalChange(response.project)
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "assistant", text: response.reply },
      ])
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text:
            error instanceof Error
              ? error.message
              : "요청을 처리하지 못했어요. 다시 시도해 주세요.",
        },
      ])
    } finally {
      operationRef.current = false
      setBusy(null)
    }
  }

  async function handleUpload(file?: File) {
    if (!file || operationRef.current || assistantLockedRef.current) return
    setNotice("")
    const validationError = validateFloorPlan(file)
    if (validationError) {
      setUploadAttempt({
        file,
        status: "FAILED",
        phase: "UPLOADING",
        progress: 0,
        error: validationError,
        retryable: false,
      })
      return
    }

    commitPreview()
    operationRef.current = true
    setBusy("upload")
    setUploadAttempt({
      file,
      status: "PROCESSING",
      phase: "UPLOADING",
      progress: 18,
      error: "",
      retryable: true,
    })
    try {
      await saveLoopRef.current
      if (saveErrorRef.current) throw saveErrorRef.current
      await new Promise((resolve) => window.setTimeout(resolve, 350))
      setUploadAttempt((current) =>
        current?.file === file ? { ...current, progress: 42 } : current
      )
      const uploaded = await uploadPlanMutation.mutateAsync({
        project: projectRef.current,
        file,
      })
      setUploadAttempt((current) =>
        current?.file === file
          ? { ...current, phase: "CONVERTING", progress: 74 }
          : current
      )
      let resolved = uploaded
      if (isServerMode && uploaded.floorPlan.status === "PROCESSING") {
        for (let attempt = 0; attempt < 10; attempt++) {
          await new Promise((resolve) => window.setTimeout(resolve, 500))
          resolved = await getProject(uploaded.id)
          setUploadAttempt((current) =>
            current?.file === file
              ? { ...current, progress: resolved.floorPlan.progress }
              : current
          )
          if (resolved.floorPlan.status !== "PROCESSING") break
        }
      }
      projectRef.current = resolved
      if (resolved.revision !== undefined)
        revisionsRef.current[resolved.id] = resolved.revision
      setProject(resolved)
      setUploadAttempt(null)
      persistLocalChange(resolved)
      setNotice(
        resolved.floorPlan.status === "READY"
          ? resolved.room
            ? "도면을 올렸어요. 로컬 데모에서는 예제 집 구조를 보여 드려요."
            : "도면을 올렸어요. 구조에서 방을 나눠 주세요."
          : resolved.floorPlan.status === "FAILED"
            ? "도면을 읽지 못했어요. 도면 파일에서 다른 파일을 올려 주세요."
            : "도면을 올렸어요. 도면 파일에서 처리 상태를 확인할 수 있어요.",
        resolved.floorPlan.status === "FAILED" ? "critical" : "default"
      )
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "도면을 올리지 못했어요. 다시 시도해 주세요."
      setUploadAttempt((current) =>
        current?.file === file
          ? { ...current, status: "FAILED", error: message }
          : current
      )
    } finally {
      operationRef.current = false
      setBusy(null)
    }
  }

  function retryUpload() {
    if (uploadAttempt?.status !== "FAILED" || !uploadAttempt.retryable) return
    void handleUpload(uploadAttempt.file)
  }

  async function handleCreate(name: string) {
    if (operationRef.current || assistantLockedRef.current) return false
    const trimmedName = name.trim()
    if (!trimmedName) return false
    commitPreview()
    operationRef.current = true
    setBusy("create")
    try {
      await saveLoopRef.current
      if (saveErrorRef.current) throw saveErrorRef.current
      const created = await createProjectMutation.mutateAsync(trimmedName)
      loadGenerationRef.current++
      if (created.revision !== undefined)
        revisionsRef.current[created.id] = created.revision
      projectRef.current = created
      setProject(created)
      if (isServerMode) {
        activeProjectIdRef.current = created.id
        rememberActiveProject(created.id)
        setProjectLoad({ status: "ready", message: "" })
      }
      setSelectedId(null)
      setPast([])
      setFuture([])
      setMessages(initialMessages)
      setUploadAttempt(null)
      setLeftTab("furniture")
      setDirty(false)
      persistLocalChange(created)
      setNotice("새 프로젝트를 만들었어요. 먼저 집 구조를 잡아 주세요.")
      return true
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "프로젝트를 만들지 못했어요. 다시 시도해 주세요.",
        "critical"
      )
      return false
    } finally {
      operationRef.current = false
      setBusy(null)
    }
  }

  async function openSampleProject() {
    if (operationRef.current || assistantLockedRef.current) return
    commitPreview()
    operationRef.current = true
    try {
      await saveLoopRef.current
      if (saveErrorRef.current) throw saveErrorRef.current
      if (isServerMode) {
        await loadServerProject(sampleProject.id)
        return
      }
      const sample = structuredClone(sampleProject)
      projectRef.current = sample
      setProject(sample)
      setUploadAttempt(null)
      setPast([])
      setFuture([])
      setSelectedId(null)
      persistLocalChange(sample)
      setNotice("예제 집을 열었어요.")
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "현재 배치를 저장한 뒤 이동해 주세요.",
        "critical"
      )
    } finally {
      operationRef.current = false
    }
  }

  async function applyRoom(room: RoomModel) {
    if (operationRef.current || assistantLockedRef.current) return false
    commitPreview()
    operationRef.current = true
    setBusy("room")
    setNotice("")
    try {
      await saveLoopRef.current
      if (saveErrorRef.current) throw saveErrorRef.current
      const updated = await saveRoomMutation.mutateAsync({
        project: projectRef.current,
        room,
      })
      const next = updated
      if (updated.revision !== undefined)
        revisionsRef.current[updated.id] = updated.revision
      projectRef.current = next
      setProject(next)
      setNotice("구조를 저장했어요.", "positive")
      return true
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "구조를 저장하지 못했어요. 다시 시도해 주세요.",
        "critical"
      )
      return false
    } finally {
      operationRef.current = false
      setBusy(null)
    }
  }

  const assistant = useLocalAssistant({
    enabled: isServerMode,
    prepare: async function prepareLocalRequest() {
      if (operationRef.current || projectLoad.status !== "ready") return null
      commitPreview()
      operationRef.current = true
      setBusy("chat")
      await saveLoopRef.current
      if (saveErrorRef.current) throw saveErrorRef.current
      return projectRef.current
    },
    release: function releaseLocalRequest() {
      operationRef.current = false
      assistantLockedRef.current = false
      setBusy(null)
    },
    applied: function applyConfirmedProject(saved) {
      loadGenerationRef.current++
      const previous = projectRef.current
      setPast((history) =>
        previous.id === saved.id
          ? [...history.slice(-29), previous.furniture]
          : []
      )
      setFuture([])
      projectRef.current = saved
      if (saved.revision !== undefined)
        revisionsRef.current[saved.id] = saved.revision
      activeProjectIdRef.current = saved.id
      rememberActiveProject(saved.id)
      queryClient.setQueryData(projectKeys.detail(saved.id), saved)
      setProject(saved)
      setProjectLoad({ status: "ready", message: "" })
      setUploadAttempt(null)
      setSelectedId(null)
      setDirty(false)
      setSaveFailed(false)
      saveErrorRef.current = null
    },
    message: function appendAssistantMessage(text) {
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "assistant", text },
      ])
    },
  })

  useEffect(
    function synchronizeAssistantLock() {
      assistantLockedRef.current = assistant.locked
    },
    [assistant.locked]
  )

  async function reloadSavedProject() {
    if (operationRef.current || assistantLockedRef.current || !isServerMode)
      return
    operationRef.current = true
    setBusy("save")
    try {
      // A sent write cannot be cancelled safely. Read only after it settles.
      await saveLoopRef.current
      transientBaseRef.current = null
      await loadServerProject(projectRef.current.id)
    } finally {
      operationRef.current = false
      setBusy(null)
    }
  }

  function exportProject() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(project, null, 2)], { type: "application/json" })
    )
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `${project.name}-layout.json`
    anchor.click()
    URL.revokeObjectURL(url)
    setNotice("배치를 JSON 파일로 내보냈어요.")
  }

  return {
    project,
    assistant,
    reloadSavedProject,
    roomBounds,
    applyRoom,
    projectLoad,
    selected,
    selectedId,
    mode,
    category,
    leftTab,
    messages,
    input,
    notice,
    busy: busy ?? (assistant.locked ? "chat" : null),
    uploadAttempt,
    dirty,
    saving,
    saveFailed,
    canUndo: !busy && !assistant.locked && past.length > 0,
    canRedo: !busy && !assistant.locked && future.length > 0,
    retryProjectLoad: () => void loadServerProject(activeProjectIdRef.current),
    openSampleProject,
    exportProject,
    saveProject: () => void handleSave(),
    setLeftTab,
    setCategory,
    addFurniture,
    retryUpload,
    setMode,
    undo,
    redo,
    reportFullscreenError: () =>
      setNotice("전체 화면으로 바꾸지 못했어요.", "critical"),
    selectFurniture,
    moveFurniture,
    previewSelected: (update: Partial<Furniture>) => {
      if (selectedId) previewFurniture(selectedId, update)
    },
    commitPreview,
    setInput,
    sendMessage: (text: string, focus?: Point2[], focusRoomName?: string) =>
      void handleChat(text, focus, focusRoomName),
    updateSelected,
    deleteSelected,
    dismissNotice,
    uploadFloorPlan: (file?: File) => void handleUpload(file),
    createProject: handleCreate,
  }
}
