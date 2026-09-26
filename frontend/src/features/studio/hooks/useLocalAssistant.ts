import { useEffect, useRef, useState } from "react"
import { getProject } from "../project-api"
import { ApiError } from "@/lib/http-client"
import {
  checkLocalModel,
  interpretLocally,
  type LayoutIntent,
} from "../local-ai"
import {
  actOnProposal,
  getServerCatalog,
  previewIntent,
  proposalStatus,
  readLayoutChoice,
  type LayoutChoice,
  type LayoutProposal,
} from "../layout-proposals"
import type { Project } from "../types"

type Pending = {
  project: Project
  intent: LayoutIntent
  selected: string | null
  choices: Record<string, string>
  focus?: string
}
type Recovery = { projectId: string; proposalId: string }
const recoveryKey = "kokoro-pending-local-proposal"
function readRecovery(): Recovery | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(recoveryKey) ?? "null")
    return value &&
      typeof value.projectId === "string" &&
      typeof value.proposalId === "string"
      ? value
      : null
  } catch {
    return null
  }
}
function remember(value: Recovery | null) {
  try {
    if (value) sessionStorage.setItem(recoveryKey, JSON.stringify(value))
    else sessionStorage.removeItem(recoveryKey)
  } catch {
    /* In-memory recovery still works when browser storage is unavailable. */
  }
}

export function useLocalAssistant({
  enabled = true,
  prepare,
  release,
  applied,
  message,
}: {
  enabled?: boolean
  prepare: () => Promise<Project | null>
  release: () => void
  applied: (project: Project) => void
  message: (text: string) => void
}) {
  const [phase, setPhase] = useState<
    "idle" | "model" | "choice" | "preview" | "saving" | "recover"
  >(() => (enabled && readRecovery() ? "recover" : "idle"))
  const [proposal, setProposal] = useState<LayoutProposal | null>(null)
  const [proposalProjectId, setProposalProjectId] = useState<string | null>(
    null
  )
  const [choice, setChoice] = useState<LayoutChoice | null>(null)
  const [error, setError] = useState("")
  const [modelStatus, setModelStatus] = useState("연결 전")
  const pendingRef = useRef<Pending | null>(null)
  const recoveryRef = useRef<Recovery | null>(enabled ? readRecovery() : null)
  const abortRef = useRef<AbortController | null>(null)
  const running = useRef(false)
  const mounted = useRef(true)

  useEffect(function abortModelOnUnmount() {
    mounted.current = true
    return function abortLocalRequest() {
      mounted.current = false
      abortRef.current?.abort()
    }
  }, [])

  async function propose(pending: Pending) {
    try {
      const result = await previewIntent(
        pending.project,
        pending.intent,
        pending.selected,
        pending.choices,
        pending.focus
      )
      if (!mounted.current) return
      recoveryRef.current = {
        projectId: pending.project.id,
        proposalId: result.id,
      }
      remember(recoveryRef.current)
      setProposalProjectId(pending.project.id)
      setProposal(result)
      setChoice(null)
      setPhase("preview")
    } catch (failure) {
      if (!mounted.current) return
      const choices = readLayoutChoice(failure)
      if (choices?.candidates.length) {
        setChoice(choices)
        setPhase("choice")
      } else {
        setError(
          failure instanceof Error
            ? failure.message
            : "배치 제안을 만들지 못했어요."
        )
        setPhase("idle")
        release()
      }
    }
  }

  async function send(text: string, selected: string | null, focus?: string) {
    if (!enabled || running.current || phase !== "idle" || !text.trim()) return
    running.current = true
    setError("")
    setProposal(null)
    setProposalProjectId(null)
    try {
      const project = await prepare()
      if (!project) return
      setPhase("model")
      abortRef.current = new AbortController()
      const catalog = await getServerCatalog()
      await checkLocalModel(abortRef.current.signal)
      setModelStatus("내 PC의 Qwen3 연결됨")
      const intent = await interpretLocally(
        text,
        project,
        catalog,
        abortRef.current.signal
      )
      if (!mounted.current) return
      if (!intent.commands.length) {
        message(intent.clarification ?? intent.reply)
        setPhase("idle")
        release()
        return
      }
      const pending = { project, intent, selected, choices: {}, focus }
      pendingRef.current = pending
      await propose(pending)
    } catch (failure) {
      if (!mounted.current) return
      setError(
        failure instanceof Error
          ? failure.message
          : "로컬 모델에 연결하지 못했어요."
      )
      setModelStatus("연결을 확인해 주세요")
      setPhase("idle")
      release()
    } finally {
      running.current = false
    }
  }

  async function choose(id: string) {
    if (running.current || !pendingRef.current || !choice?.choiceKey) return
    running.current = true
    const pending = {
      ...pendingRef.current,
      choices: { ...pendingRef.current.choices, [choice.choiceKey]: id },
    }
    pendingRef.current = pending
    setPhase("model")
    try {
      await propose(pending)
    } finally {
      running.current = false
    }
  }

  async function resolve(result: LayoutProposal) {
    if (
      result.status === "PENDING" ||
      result.status === "APPLIED" ||
      result.status === "STALE"
    ) {
      const current = await getProject(recoveryRef.current!.projectId)
      if (!mounted.current) return
      applied(current)
      if (
        result.status === "PENDING" &&
        current.revision === result.baseRevision
      ) {
        setProposalProjectId(current.id)
        setProposal(result)
        setPhase("preview")
        setError("")
        return
      }
      message(
        result.status === "APPLIED"
          ? "확인한 배치를 서버에 저장했어요."
          : "프로젝트가 바뀌어 최신 저장본을 불러왔어요. 다시 요청해 주세요."
      )
    } else {
      message(
        result.status === "CANCELLED"
          ? "제안을 취소했어요. 배치는 바꾸지 않았어요."
          : "제안이 만료되었거나 프로젝트가 바뀌었어요. 다시 요청해 주세요."
      )
    }
    recoveryRef.current = null
    remember(null)
    pendingRef.current = null
    setProposal(null)
    setProposalProjectId(null)
    setChoice(null)
    setError("")
    setPhase("idle")
    release()
  }

  async function act(action: "confirm" | "cancel" | "recover") {
    if (running.current) return
    if (phase === "choice" && action === "cancel") {
      pendingRef.current = null
      setChoice(null)
      setPhase("idle")
      release()
      return
    }
    const recovery = recoveryRef.current
    if (!recovery) return
    running.current = true
    setPhase("saving")
    setError("")
    try {
      const result =
        action === "recover"
          ? await proposalStatus(recovery.projectId, recovery.proposalId)
          : await actOnProposal(recovery.projectId, recovery.proposalId, action)
      if (mounted.current) await resolve(result)
    } catch (failure) {
      // The server may already have applied the request. Never unlock or create a fresh proposal here.
      if (mounted.current) {
        if (
          action === "recover" &&
          failure instanceof ApiError &&
          failure.status === 404
        ) {
          recoveryRef.current = null
          remember(null)
          setProposal(null)
          setProposalProjectId(null)
          setPhase("idle")
          setError(
            "이전 제안이나 프로젝트에 접근할 수 없어요. 서버 저장본을 다시 불러와 주세요."
          )
          release()
          return
        }
        setPhase("recover")
        setError(
          "처리 결과를 확인하지 못했어요. 상태를 확인할 때까지 편집을 잠시 멈춰요."
        )
      }
    } finally {
      running.current = false
    }
  }

  return {
    phase,
    proposal,
    proposalProjectId,
    choice,
    error,
    modelStatus,
    send,
    choose,
    act,
    locked: phase !== "idle",
    confirming: phase === "saving" || phase === "recover",
  }
}
