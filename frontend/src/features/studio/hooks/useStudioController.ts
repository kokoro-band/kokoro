import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useRef, useState } from "react"

import { initialMessages, sampleProject } from "@/features/studio/data"
import {
  isServerMode,
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
import type {
  RoomModel,
  Category,
  ChatMessage,
  Furniture,
  Project,
  ProjectLoadState,
  UploadAttempt,
  ViewMode,
} from "@/features/studio/types"

const maxFloorPlanBytes = 15 * 1024 * 1024
const supportedFloorPlanTypes = ["application/pdf", "image/png", "image/jpeg"]

function validateFloorPlan(file: File) {
  if (!supportedFloorPlanTypes.includes(file.type))
    return "PDF, PNG, JPG 형식의 도면을 선택해 주세요."
  if (file.size > maxFloorPlanBytes) return "도면 파일은 15MB 이하여야 합니다."
  if (file.size === 0) return "비어 있는 파일은 업로드할 수 없습니다."
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
  const [selectedId, setSelectedId] = useState<string | null>("sofa-01")
  const [mode, setMode] = useState<ViewMode>("3d")
  const [category, setCategory] = useState<Category>("전체")
  const [leftTab, setLeftTab] = useState<"furniture" | "plan">("furniture")
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [input, setInput] = useState("")
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState<
    "chat" | "save" | "upload" | "create" | null
  >(null)
  const [uploadAttempt, setUploadAttempt] = useState<UploadAttempt | null>(null)
  const [past, setPast] = useState<Furniture[][]>([])
  const [future, setFuture] = useState<Furniture[][]>([])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showLeft, setShowLeft] = useState(true)

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

  const selected = project.furniture.find((item) => item.id === selectedId)
  const roomBounds = project.room?.bounds ?? {
    width: project.dimensions.width,
    depth: project.dimensions.depth,
  }

  const queueServerSave = useCallback(function queueServerSave(
    snapshot: Project
  ) {
    if (!isServerMode) return
    queuedSaveRef.current = snapshot
    if (saveLoopRef.current) return

    saveLoopRef.current = (async () => {
      setSaving(true)
      try {
        while (queuedSaveRef.current) {
          const next = queuedSaveRef.current
          queuedSaveRef.current = null
          try {
            const saved = await saveProjectAsyncRef.current(next)
            if (projectRef.current === next) {
              projectRef.current = saved
              setProject(saved)
              setDirty(false)
            }
          } catch (error) {
            queuedSaveRef.current = null
            setDirty(true)
            setNotice(
              error instanceof Error
                ? error.message
                : "배치를 자동 저장하지 못했습니다."
            )
          }
        }
      } finally {
        saveLoopRef.current = null
        setSaving(false)
      }
    })()
  }, [])

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
        setSelectedId(loaded.furniture[0]?.id ?? null)
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
              : "서버에서 프로젝트를 불러오지 못했습니다.",
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
    queueServerSave(updated)
  }

  const selectFurniture = useCallback(function selectFurniture(
    id: string | null
  ) {
    setSelectedId(id)
  }, [])

  const moveFurniture = useCallback(function moveFurniture(
    id: string,
    x: number,
    z: number
  ) {
    const updated = {
      ...projectRef.current,
      furniture: projectRef.current.furniture.map((item) =>
        item.id === id ? { ...item, x, z } : item
      ),
    }
    projectRef.current = updated
    setProject(updated)
    setDirty(true)
  }, [])

  const saveMovedFurniture = useCallback(
    function saveMovedFurniture() {
      queueServerSave(projectRef.current)
    },
    [queueServerSave]
  )

  function updateSelected(update: Partial<Furniture>) {
    commitFurniture(
      project.furniture.map((item) =>
        item.id === selectedId ? { ...item, ...update } : item
      )
    )
  }

  function deleteSelected() {
    commitFurniture(project.furniture.filter((item) => item.id !== selectedId))
    setSelectedId(null)
  }

  function addFurniture(catalogId: string) {
    const step = project.furniture.length
    const item = makeFurniture(
      catalogId,
      round(roomBounds.width * 0.4 + ((step * 0.6) % 1.8)),
      round(roomBounds.depth * 0.45 + ((step * 0.4) % 1.2))
    )
    commitFurniture([...project.furniture, item])
    setSelectedId(item.id)
    setNotice(`${item.name}를 추가했습니다.`)
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
    queueServerSave(updated)
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
    queueServerSave(updated)
  }

  async function handleSave() {
    const snapshot = projectRef.current
    setBusy("save")
    try {
      const saved = await saveProjectMutation.mutateAsync(snapshot)
      if (projectRef.current === snapshot) {
        projectRef.current = saved
        setProject(saved)
        setDirty(false)
      }
      setNotice(
        isServerMode
          ? "서버에 배치를 저장했습니다."
          : "이 브라우저에 프로젝트를 저장했습니다."
      )
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "저장하지 못했습니다.")
    } finally {
      setBusy(null)
    }
  }

  async function handleChat(text: string) {
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
      })
      setPast((history) => [...history.slice(-29), project.furniture])
      setFuture([])
      projectRef.current = response.project
      setProject(response.project)
      setDirty(!isServerMode)
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
              : "요청을 처리하지 못했습니다.",
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
    setLeftTab("plan")
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
      await new Promise((resolve) => window.setTimeout(resolve, 450))
      projectRef.current = uploaded
      setProject(uploaded)
      setUploadAttempt(null)
      setDirty(true)
      setNotice("도면을 등록했습니다. 현재 변환기는 예제 방 치수를 사용합니다.")
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "도면을 등록하지 못했습니다. 다시 시도해 주세요."
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
      setLeftTab("plan")
      setDirty(!isServerMode)
      setNotice("새 프로젝트를 만들었습니다. 도면을 업로드해 주세요.")
      return true
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "프로젝트를 만들지 못했습니다."
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
    setDirty(true)
    setNotice("예제 프로젝트를 열었습니다.")
  }

  async function applyRoom(room: RoomModel) {
    setNotice("")
    try {
      const updated = await saveRoomMutation.mutateAsync({ project, room })
      setProject(updated)
      setNotice("공간 정보를 저장했습니다.")
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "공간 정보를 저장하지 못했습니다."
      )
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
    setNotice("배치 데이터를 JSON 파일로 내보냈습니다.")
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
    showLibrary: showLeft,
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
    toggleLibrary: () => setShowLeft((current) => !current),
    undo,
    redo,
    reportFullscreenError: () => setNotice("전체 화면을 시작하지 못했습니다."),
    selectFurniture,
    moveFurniture,
    saveMovedFurniture,
    setInput,
    sendMessage: (text: string) => void handleChat(text),
    updateSelected,
    deleteSelected,
    dismissNotice: () => setNotice(""),
    uploadFloorPlan: (file?: File) => void handleUpload(file),
    createProject: handleCreate,
  }
}
