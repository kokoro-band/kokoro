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
import {
  constrainFurniturePose,
  findFurniturePlacement,
} from "@/features/studio/furniture-motion"
import type {
  RoomModel,
  RoomLabel,
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
    "chat" | "save" | "upload" | "create" | null
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
              const saved = await saveProjectAsyncRef.current(next)
              setSaveFailed(false)
              if (projectRef.current === next) {
                projectRef.current = saved
                setProject(saved)
                setDirty(false)
              }
            } catch (error) {
              failed = true
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
      activeProjectIdRef.current = projectId
      setProjectLoad({ status: "loading", message: "" })
      try {
        const loaded = await queryClient.fetchQuery(
          projectQueryOptions(projectId)
        )
        if (activeProjectIdRef.current !== projectId) return
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
        if (activeProjectIdRef.current !== projectId) return
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

  useEffect(() => {
    saveProjectAsyncRef.current = saveProjectMutation.mutateAsync
  }, [saveProjectMutation.mutateAsync])

  useEffect(() => {
    if (!isServerMode || startedInitialLoadRef.current) return
    startedInitialLoadRef.current = true
    void loadServerProject(activeProjectIdRef.current)
  }, [loadServerProject])

  function commitFurniture(next: Furniture[]) {
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
    update: Partial<Furniture>,
    focus?: RoomLabel | null
  ) {
    const current = projectRef.current.furniture.find((item) => item.id === id)
    if (!current) return false
    const next = constrainFurniturePose(
      projectRef.current,
      current,
      update,
      focus
    )
    if (
      next.x === current.x &&
      next.z === current.z &&
      next.rotation === current.rotation
    )
      return false
    transientBaseRef.current ??= projectRef.current.furniture
    const updated = {
      ...projectRef.current,
      furniture: projectRef.current.furniture.map((item) =>
        item.id === id ? next : item
      ),
    }
    projectRef.current = updated
    setProject(updated)
    setDirty(true)
    return true
  }, [])

  const moveFurniture = useCallback(
    function moveFurniture(
      id: string,
      x: number,
      z: number,
      focus?: RoomLabel | null
    ) {
      return previewFurniture(id, { x, z }, focus)
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

  function updateSelected(
    update: Partial<Furniture>,
    focus?: RoomLabel | null
  ) {
    const current = projectRef.current.furniture.find(
      (item) => item.id === selectedId
    )
    if (!current) return null
    const next = constrainFurniturePose(
      projectRef.current,
      current,
      update,
      focus
    )
    if (
      next.x === current.x &&
      next.z === current.z &&
      next.rotation === current.rotation
    )
      return current
    commitFurniture(
      projectRef.current.furniture.map((item) =>
        item.id === selectedId ? next : item
      )
    )
    return next
  }

  function deleteSelected() {
    commitFurniture(project.furniture.filter((item) => item.id !== selectedId))
    setSelectedId(null)
  }

  function addFurniture(
    catalogId: string,
    position?: [number, number],
    focus?: RoomLabel | null
  ) {
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
    const placed = findFurniturePlacement(projectRef.current, item, focus)
    if (!placed) {
      setNotice("이 가구를 벽과 겹치지 않게 놓을 공간이 없어요.", "critical")
      return
    }
    commitFurniture([...projectRef.current.furniture, placed])
    setSelectedId(item.id)
    setNotice(`${withObjectParticle(item.name)} 놓았어요.`)
  }

  function undo() {
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
    const snapshot = projectRef.current
    setBusy("save")
    try {
      const saved = await saveProjectMutation.mutateAsync(snapshot)
      setSaveFailed(false)
      if (projectRef.current === snapshot) {
        projectRef.current = saved
        setProject(saved)
        setDirty(false)
      }
      setNotice(
        isServerMode ? "저장했어요." : "이 브라우저에 저장했어요.",
        "positive"
      )
    } catch (error) {
      setSaveFailed(true)
      setNotice(
        error instanceof Error ? error.message : "저장하지 못했어요.",
        "critical",
        "retrySave"
      )
    } finally {
      setBusy(null)
    }
  }

  async function handleChat(text: string, focus?: Point2[]) {
    if (!text.trim() || busy) return
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", text },
    ])
    setInput("")
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
      // 실패한 요청을 다시 적지 않도록 입력창이 비어 있으면 되살립니다.
      setInput((current) => current || text)
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
      setBusy(null)
    }
  }

  async function handleUpload(file?: File) {
    if (!file) return
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
      await new Promise((resolve) => window.setTimeout(resolve, 350))
      setUploadAttempt((current) =>
        current?.file === file ? { ...current, progress: 42 } : current
      )
      const uploaded = await uploadPlanMutation.mutateAsync({ project, file })
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
      setBusy(null)
    }
  }

  function retryUpload() {
    if (uploadAttempt?.status !== "FAILED" || !uploadAttempt.retryable) return
    void handleUpload(uploadAttempt.file)
  }

  async function handleCreate(name: string) {
    const trimmedName = name.trim()
    if (!trimmedName) return false
    setBusy("create")
    try {
      const created = await createProjectMutation.mutateAsync(trimmedName)
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
      setBusy(null)
    }
  }

  function openSampleProject() {
    if (isServerMode) {
      void loadServerProject(sampleProject.id)
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
  }

  async function applyRoom(room: RoomModel) {
    setNotice("")
    try {
      // Finish the current layout write before saving a new structure. Both API
      // endpoints replace the project and must not race in this recovery flow.
      await saveLoopRef.current
      const updated = await saveRoomMutation.mutateAsync({
        project: projectRef.current,
        room,
      })
      const next = {
        ...projectRef.current,
        room: updated.room,
        updatedAt: updated.updatedAt,
      }
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
    busy,
    uploadAttempt,
    dirty,
    saving,
    saveFailed,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
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
    previewSelected: (update: Partial<Furniture>, focus?: RoomLabel | null) => {
      if (selectedId) return previewFurniture(selectedId, update, focus)
      return false
    },
    commitPreview,
    setInput,
    sendMessage: (text: string, focus?: Point2[]) =>
      void handleChat(text, focus),
    updateSelected,
    deleteSelected,
    dismissNotice,
    uploadFloorPlan: (file?: File) => void handleUpload(file),
    createProject: handleCreate,
  }
}
