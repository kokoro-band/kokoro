import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useRef, useState } from "react"
import { ApiError } from "@/lib/http-client"
import { commandLayoutKey, CommandReviewExpiredError } from "../command-review"

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
  confirmCommandMutationOptions,
  createProjectMutationOptions,
  executeProjectMutation,
  projectQueryOptions,
  saveProjectMutationOptions,
  saveRoomMutationOptions,
  sendCommandMutationOptions,
  uploadPlanMutationOptions,
} from "@/features/studio/project-queries"
import {
  ClosingWrites,
  mergeFurniture,
  ProjectWriteQueue,
  sameFurniture,
  saveFailureKind,
  WriteCancelledError,
  WriteSkippedError,
} from "@/features/studio/project-write-queue"
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
  CommandReview,
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
  action?: "retrySave" | "restoreSaved"
}

type SaveError = "network" | "rejected"

/** Wait this long without another notice before announcing an autosave. */
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
  const [commandReview, setCommandReviewState] = useState<CommandReview | null>(
    null
  )
  const commandReviewRef = useRef<CommandReview | null>(null)
  const commandOperationRef = useRef<symbol | null>(null)
  const setCommandReview = useCallback(function setCommandReview(
    next: CommandReview | null
  ) {
    commandReviewRef.current = next
    setCommandReviewState(next)
  }, [])
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
  const [saveError, setSaveError] = useState<SaveError | null>(null)

  const queryClient = useQueryClient()
  const createProjectMutation = useMutation(
    createProjectMutationOptions(queryClient)
  )

  const activeProjectIdRef = useRef(readActiveProjectId() ?? sampleProject.id)
  const startedInitialLoadRef = useRef(false)
  /** The queue holds the server-confirmed snapshot; this ref holds the visible draft. */
  const projectRef = useRef(project)
  const transientBaseRef = useRef<Furniture[] | null>(null)
  const queueRef = useRef<ProjectWriteQueue | null>(null)
  const closingWritesRef = useRef(new ClosingWrites())
  /** Increases on every project switch so a slower load or create cannot replace a newer project. */
  const navigationRef = useRef(0)
  const layoutPromiseRef = useRef<Promise<Project> | null>(null)
  // Recovery actions belong to a specific failure, not the most recent informational notice.
  const saveFailureRef = useRef<{
    noticeId: number
    queue: ProjectWriteQueue
    kind: SaveError
  } | null>(null)

  const selected = project.furniture.find((item) => item.id === selectedId)
  const roomBounds = project.room?.bounds ?? {
    width: project.dimensions.width,
    depth: project.dimensions.depth,
  }

  const dismissNotice = useCallback(() => setNotice(""), [setNotice])

  const setDraft = useCallback(function setDraft(next: Project) {
    projectRef.current = next
    setProject(next)
  }, [])

  const isCurrent = useCallback(function isCurrent(queue: ProjectWriteQueue) {
    return queueRef.current === queue && !queue.closed
  }, [])

  const syncSaveState = useCallback(function syncSaveState() {
    const queue = queueRef.current
    if (!queue) return
    setSaving(queue.busy)
    setDirty(
      queue.busy ||
        transientBaseRef.current !== null ||
        !sameFurniture(projectRef.current.furniture, queue.saved.furniture)
    )
  }, [])

  const makeQueue = useCallback(
    function makeQueue(saved: Project, after?: Promise<unknown>) {
      const queue: ProjectWriteQueue = new ProjectWriteQueue(saved, {
        after,
        saveLayout: (base, furniture) =>
          executeProjectMutation(
            queryClient,
            saveProjectMutationOptions(queryClient, base.id),
            { ...base, furniture }
          ),
        onChange: () => {
          if (queueRef.current === queue) syncSaveState()
        },
      })
      return queue
    },
    [queryClient, syncSaveState]
  )

  const currentQueue = useCallback(
    function currentQueue() {
      queueRef.current ??= makeQueue(projectRef.current)
      return queueRef.current
    },
    [makeQueue]
  )

  const hasUnsavedChanges = useCallback(
    function hasUnsavedChanges() {
      const queue = currentQueue()
      return (
        queue.busy ||
        transientBaseRef.current !== null ||
        !sameFurniture(projectRef.current.furniture, queue.saved.furniture)
      )
    },
    [currentQueue]
  )

  function confirmLeave() {
    return (
      !hasUnsavedChanges() ||
      window.confirm(
        "아직 저장하지 않은 변경이 있어요. 다른 프로젝트로 가면 이 변경은 사라져요. 이동할까요?"
      )
    )
  }

  /** Cancel queued writes and remember when the in-flight request finishes. */
  const closeQueue = useCallback(
    function closeQueue() {
      return closingWritesRef.current.add(currentQueue())
    },
    [currentQueue]
  )

  /**
   * Reopen a project only after its previous requests finish. The local demo has one shared storage slot, so it waits for every project.
   */
  const closingFor = useCallback(function closingFor(projectId: string) {
    return isServerMode
      ? closingWritesRef.current.for(projectId)
      : closingWritesRef.current.all()
  }, [])

  const openProject = useCallback(
    function openProject(saved: Project) {
      noticeIdRef.current += 1
      queueRef.current = makeQueue(saved, closingFor(saved.id))
      layoutPromiseRef.current = null
      transientBaseRef.current = null
      setDraft(saved)
      setSelectedId(null)
      setPast([])
      setFuture([])
      setUploadAttempt(null)
      commandOperationRef.current = null
      setCommandReview(null)
      setBusy(null)
      setSaveError(null)
      saveFailureRef.current = null
      syncSaveState()
    },
    [closingFor, makeQueue, setDraft, syncSaveState, setCommandReview]
  )

  const reportSaveFailure = useCallback(
    function reportSaveFailure(error: unknown) {
      if (error instanceof WriteSkippedError) {
        // The earlier failure already reported the cause; keep only the unsaved state.
        setSaveError((current) => current ?? "network")
        return
      }
      const kind = saveFailureKind(error)
      const queue = queueRef.current
      if (queue) {
        saveFailureRef.current = {
          noticeId: noticeIdRef.current + 1,
          queue,
          kind,
        }
      }
      setSaveError(kind)
      const message =
        error instanceof Error ? error.message : "자동으로 저장하지 못했어요."
      setNotice(
        kind === "rejected"
          ? `${message} 이 배치는 저장되지 않았어요.`
          : message,
        "critical",
        kind === "rejected" ? "restoreSaved" : "retrySave"
      )
    },
    [setNotice]
  )

  // Server mode autosaves to the server; the local demo autosaves in this browser.
  const persistLayout = useCallback(
    function persistLayout(furniture: Furniture[]) {
      const queue = currentQueue()
      const promise = queue.saveLayout(furniture)
      if (promise === layoutPromiseRef.current) return promise
      layoutPromiseRef.current = promise
      promise.then(
        () => {
          if (!isCurrent(queue)) return
          setSaveError(null)
          saveFailureRef.current = null
          if (
            !queue.busy &&
            Date.now() - lastNoticeAtRef.current > autosaveNoticeQuietMs
          ) {
            setNotice("자동으로 저장했어요.", "positive")
          }
        },
        (error: unknown) => {
          if (!isCurrent(queue)) return
          if (error instanceof WriteCancelledError) return
          reportSaveFailure(error)
        }
      )
      return promise
    },
    [currentQueue, isCurrent, reportSaveFailure, setNotice]
  )

  const persistLocalProject = useCallback(
    function persistLocalProject(snapshot: Project) {
      if (isServerMode) return
      const queue = currentQueue()
      queue
        .run("project", async () => {
          const saved = await executeProjectMutation(
            queryClient,
            saveProjectMutationOptions(queryClient, snapshot.id),
            snapshot
          )
          return { project: saved, result: saved }
        })
        .catch((error: unknown) => {
          if (!isCurrent(queue)) return
          if (error instanceof WriteCancelledError) return
          reportSaveFailure(error)
        })
    },
    [currentQueue, isCurrent, queryClient, reportSaveFailure]
  )

  const loadServerProject = useCallback(
    async function loadServerProject(projectId: string) {
      const navigation = (navigationRef.current += 1)
      activeProjectIdRef.current = projectId
      setProjectLoad({ status: "loading", message: "" })
      void closeQueue()
      // Reopen the same project only after its outgoing request finishes, so the load includes that change.
      await closingFor(projectId)
      try {
        const loaded = await queryClient.fetchQuery(
          projectQueryOptions(projectId)
        )
        if (navigationRef.current !== navigation) return
        rememberActiveProject(loaded.id)
        openProject(loaded)
        setProjectLoad({ status: "ready", message: "" })
      } catch (error) {
        if (navigationRef.current !== navigation) return
        setProjectLoad({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "프로젝트를 불러오지 못했어요.",
        })
      }
    },
    [closeQueue, closingFor, openProject, queryClient]
  )

  useEffect(() => {
    if (!isServerMode || startedInitialLoadRef.current) return
    startedInitialLoadRef.current = true
    void loadServerProject(activeProjectIdRef.current)
  }, [loadServerProject])

  useEffect(() => {
    if (!dirty && !saving) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty, saving])

  function commitFurniture(next: Furniture[]) {
    const updated = { ...projectRef.current, furniture: next }
    setPast((history) => [...history.slice(-29), project.furniture])
    setFuture([])
    setDraft(updated)
    void persistLayout(next)
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
      if (!base || base === projectRef.current.furniture) {
        syncSaveState()
        return
      }
      setPast((history) => [...history.slice(-29), base])
      setFuture([])
      void persistLayout(projectRef.current.furniture)
    },
    [persistLayout, syncSaveState]
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
    setDraft({ ...projectRef.current, furniture: previous })
    void persistLayout(previous)
  }

  function redo() {
    const next = future[0]
    if (!next) return
    setPast((history) => [...history, project.furniture])
    setFuture((history) => history.slice(1))
    setDraft({ ...projectRef.current, furniture: next })
    void persistLayout(next)
  }

  async function handleSave() {
    const queue = currentQueue()
    setBusy("save")
    try {
      await persistLayout(projectRef.current.furniture)
      if (!isCurrent(queue)) return
      setNotice(
        isServerMode ? "저장했어요." : "이 브라우저에 저장했어요.",
        "positive"
      )
    } catch {
      // persistLayout reports the failure and provides the retry action.
    } finally {
      if (isCurrent(queue)) {
        setBusy((current) => (current === "save" ? null : current))
      }
    }
  }

  function restoreSaved(noticeId?: number) {
    if (noticeId !== undefined && !isActiveSaveFailure(noticeId, "rejected"))
      return
    const queue = currentQueue()
    // Snackbar actions can outlive the failure and bypass the disabled toolbar.
    if (queue.busy || saveError !== "rejected") return
    const saved = queue.saved
    const current = projectRef.current
    transientBaseRef.current = null
    setPast((history) => [...history.slice(-29), current.furniture])
    setFuture([])
    setDraft({ ...current, furniture: saved.furniture })
    setSaveError(null)
    saveFailureRef.current = null
    if (!saved.furniture.some((item) => item.id === selectedId))
      setSelectedId(null)
    syncSaveState()
    setNotice("마지막으로 저장한 배치로 되돌렸어요.")
  }

  function isActiveSaveFailure(noticeId: number, kind: SaveError) {
    const failure = saveFailureRef.current
    return Boolean(
      failure &&
      failure.noticeId === noticeId &&
      failure.kind === kind &&
      failure.queue === queueRef.current &&
      !failure.queue.closed &&
      !failure.queue.busy
    )
  }

  function retryFailedSave(noticeId: number) {
    if (!isActiveSaveFailure(noticeId, "network")) return
    void handleSave()
  }

  async function handleChat(
    text: string,
    focus?: Point2[],
    review?: CommandReview,
    furnitureId?: string
  ) {
    if (!text.trim() || busy || commandOperationRef.current) return
    if (!review && commandReviewRef.current) return
    const queue = currentQueue()
    if (queue.closed) return
    const operation = Symbol("command")
    commandOperationRef.current = operation
    if (review) setCommandReview({ ...review, status: "applying", error: "" })
    else
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "user", text },
      ])
    setInput("")
    setBusy("chat")
    try {
      const reply = await queue.run("command", async (saved) => {
        if (
          review &&
          (review.baseKey !== commandLayoutKey(saved) ||
            review.baseKey !== commandLayoutKey(projectRef.current))
        )
          throw new CommandReviewExpiredError()
        if (!sameFurniture(saved.furniture, projectRef.current.furniture))
          throw new Error("먼저 배치를 저장한 뒤 다시 요청해 주세요.")
        const confirming = Boolean(review?.response.requiresConfirmation)
        if (
          confirming &&
          review?.status !== "retry" &&
          Date.parse(review!.response.expiresAt ?? "") <= Date.now()
        )
          throw new CommandReviewExpiredError()
        const response = confirming
          ? await executeProjectMutation(
              queryClient,
              confirmCommandMutationOptions(queryClient, saved.id),
              { project: saved, proposalId: review!.response.proposalId! }
            )
          : await executeProjectMutation(
              queryClient,
              sendCommandMutationOptions(queryClient, saved.id),
              { project: saved, message: text, focus, furnitureId }
            )
        if (response.requiresConfirmation || response.candidates?.length) {
          if (
            response.requiresConfirmation &&
            (!response.proposalId ||
              !Number.isFinite(Date.parse(response.expiresAt ?? "")) ||
              !response.proposedCommands?.length)
          )
            throw new Error(
              "확인할 제안이 올바르지 않아요. 다시 요청해 주세요."
            )
          if (isCurrent(queue))
            setCommandReview({
              response,
              message: text,
              focus,
              baseKey: commandLayoutKey(saved),
              status:
                commandLayoutKey(saved) === commandLayoutKey(projectRef.current)
                  ? "ready"
                  : "stale",
              error: "",
            })
          return { project: saved, result: response.reply }
        }
        const result =
          isServerMode || confirming
            ? response.project
            : sameFurniture(saved.furniture, response.project.furniture)
              ? saved
              : await executeProjectMutation(
                  queryClient,
                  saveProjectMutationOptions(queryClient, saved.id),
                  response.project
                )
        if (isCurrent(queue)) {
          const rebase = (furniture: Furniture[]) =>
            mergeFurniture(saved.furniture, result.furniture, furniture)
          queue.rebasePendingLayouts(rebase)
          const draft = projectRef.current
          const next = rebase(draft.furniture)
          if (!sameFurniture(draft.furniture, next)) {
            setPast((history) => [...history.slice(-29), draft.furniture])
            setFuture([])
          }
          setCommandReview(null)
          setDraft({
            ...draft,
            furniture: next,
            updatedAt: result.updatedAt,
          })
        }
        return { project: result, result: response.reply }
      })
      if (!isCurrent(queue)) return
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "assistant", text: reply },
      ])
    } catch (error) {
      if (!isCurrent(queue)) return
      if (review) {
        const stale =
          error instanceof CommandReviewExpiredError ||
          error instanceof WriteSkippedError ||
          (error instanceof ApiError &&
            (error.status === 404 || error.status === 409 || !error.retryable))
        setCommandReview({
          ...review,
          status: stale ? "stale" : "retry",
          error: stale
            ? "배치가 바뀌었거나 제안을 적용할 수 없어요. 다시 요청해 주세요."
            : "결과를 받지 못했어요. 같은 요청으로 다시 확인해 주세요.",
        })
        return
      }
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
      if (commandOperationRef.current === operation) {
        commandOperationRef.current = null
        if (isCurrent(queue))
          setBusy((current) => (current === "chat" ? null : current))
      }
    }
  }

  function cancelCommandReview() {
    if (commandOperationRef.current) return
    setCommandReview(null)
  }

  function validCommandReview() {
    const review = commandReviewRef.current
    if (
      !review ||
      review.status === "applying" ||
      review.status === "stale" ||
      commandOperationRef.current
    )
      return null
    if (
      review.baseKey !== commandLayoutKey(projectRef.current) ||
      (review.status !== "retry" &&
        review.response.expiresAt &&
        Date.parse(review.response.expiresAt) <= Date.now())
    ) {
      setCommandReview({
        ...review,
        status: "stale",
        error: "배치가 바뀌었거나 제안이 만료됐어요. 다시 요청해 주세요.",
      })
      return null
    }
    return review
  }

  function confirmCommandReview() {
    const review = validCommandReview()
    if (!review?.response.requiresConfirmation) return
    void handleChat(review.message, review.focus, review)
  }

  function chooseCommandCandidate(furnitureId: string) {
    const review = validCommandReview()
    if (
      !review ||
      !review.response.candidates.some(
        (item) => item.furnitureId === furnitureId
      )
    )
      return
    void handleChat(review.message, review.focus, review, furnitureId)
  }

  function requestCommandAgain() {
    const review = commandReviewRef.current
    if (!review || commandOperationRef.current || busy) return
    setCommandReview(null)
    void handleChat(review.message, review.focus)
  }

  function applyFloorPlanResult(resolved: Project) {
    setDraft({
      ...projectRef.current,
      // Server upload status is not a room revision or an analysis result.
      // Only the local demo supplies a sample room as part of its upload flow.
      ...(!isServerMode ? { room: resolved.room } : {}),
      floorPlan: resolved.floorPlan,
      updatedAt: resolved.updatedAt,
    })
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

    const queue = currentQueue()
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
      const uploaded = await queue.run("floor-plan", async (saved) => {
        const response = await executeProjectMutation(
          queryClient,
          uploadPlanMutationOptions(queryClient, saved.id),
          { project: saved, file }
        )
        const result = isServerMode
          ? response
          : await executeProjectMutation(
              queryClient,
              saveProjectMutationOptions(queryClient, saved.id),
              response
            )
        return { project: result, result }
      })
      if (!isCurrent(queue)) return
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
          if (!isCurrent(queue)) return
          setUploadAttempt((current) =>
            current?.file === file
              ? { ...current, progress: resolved.floorPlan.progress }
              : current
          )
          if (resolved.floorPlan.status !== "PROCESSING") break
        }
      }
      applyFloorPlanResult(resolved)
      setUploadAttempt(null)
      setNotice(
        resolved.floorPlan.status === "READY"
          ? isServerMode
            ? "도면 파일 처리가 끝났어요. 현재 집 구조는 그대로예요."
            : "도면을 올렸어요. 로컬 데모에서는 예제 집 구조를 보여 드려요."
          : resolved.floorPlan.status === "FAILED"
            ? "도면을 읽지 못했어요. 도면 파일에서 다른 파일을 올려 주세요."
            : "도면을 올렸어요. 도면 파일에서 처리 상태를 확인할 수 있어요.",
        resolved.floorPlan.status === "FAILED" ? "critical" : "default"
      )
    } catch (error) {
      if (!isCurrent(queue)) return
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
    if (!confirmLeave()) return false
    const navigation = navigationRef.current
    setBusy("create")
    try {
      const created = await createProjectMutation.mutateAsync(trimmedName)
      // The user opened another project while this one was being created.
      if (navigationRef.current !== navigation) return false
      navigationRef.current += 1
      if (isServerMode) {
        activeProjectIdRef.current = created.id
        rememberActiveProject(created.id)
        setProjectLoad({ status: "ready", message: "" })
      }
      void closeQueue()
      openProject(created)
      persistLocalProject(created)
      setMessages(initialMessages)
      setLeftTab("furniture")
      setNotice("새 프로젝트를 만들었어요. 먼저 집 구조를 잡아 주세요.")
      return true
    } catch (error) {
      if (navigationRef.current !== navigation) return false
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
    if (!confirmLeave()) return
    if (isServerMode) {
      void loadServerProject(sampleProject.id)
      return
    }
    navigationRef.current += 1
    void closeQueue()
    const sample = structuredClone(sampleProject)
    openProject(sample)
    persistLocalProject(sample)
    setNotice("예제 집을 열었어요.")
  }

  async function applyRoom(room: RoomModel) {
    setNotice("")
    const queue = currentQueue()
    try {
      await queue.run("room", async (saved) => {
        const updated = await executeProjectMutation(
          queryClient,
          saveRoomMutationOptions(queryClient, saved.id),
          { project: saved, room }
        )
        if (isCurrent(queue)) {
          setDraft({
            ...projectRef.current,
            room: updated.room,
            updatedAt: updated.updatedAt,
          })
        }
        return { project: updated, result: updated }
      })
      if (!isCurrent(queue)) return false
      setNotice("구조를 저장했어요.", "positive")
      return true
    } catch (error) {
      if (!isCurrent(queue)) return false
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
    commandReview,
    cancelCommandReview,
    confirmCommandReview,
    chooseCommandCandidate,
    requestCommandAgain,
    input,
    notice,
    busy,
    uploadAttempt,
    dirty,
    saving,
    saveFailed: saveError !== null,
    saveRejected: saveError === "rejected",
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    retryProjectLoad: () => void loadServerProject(activeProjectIdRef.current),
    openSampleProject,
    exportProject,
    saveProject: () => void handleSave(),
    retryFailedSave,
    restoreSavedProject: restoreSaved,
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
