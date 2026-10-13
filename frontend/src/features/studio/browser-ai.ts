import {
  browserIntentPrompt,
  groundBrowserIntent,
  parseBrowserIntent,
  resolveRequestedRotation,
} from "./browser-ai-intent"
import type { BrowserIntent } from "./browser-ai-intent"
import type { Project } from "./types"

type WorkerResult = {
  id: number
  type: "loading" | "generating" | "result" | "error"
  text?: string
}

let worker: Worker | null = null
let nextId = 0
const pending = new Map<
  number,
  {
    resolve: (value: string) => void
    reject: (reason: Error) => void
    status: (value: string) => void
    timer: ReturnType<typeof setTimeout>
  }
>()

function resetWorker(reason: Error) {
  worker?.terminate()
  worker = null
  for (const request of pending.values()) {
    clearTimeout(request.timer)
    request.reject(reason)
  }
  pending.clear()
}

export function stopBrowserAi() {
  resetWorker(new Error("브라우저 AI 요청을 중단했어요. 배치는 유지했어요."))
}

function getWorker() {
  if (worker) return worker
  worker = new Worker(new URL("./browser-ai.worker.ts", import.meta.url), {
    type: "module",
  })
  worker.onmessage = (event: MessageEvent<WorkerResult>) => {
    const { id, type, text } = event.data
    const request = pending.get(id)
    if (!request) return
    if (type === "loading")
      request.status("모델을 준비하고 있어요. 첫 실행에는 다운로드가 필요해요.")
    if (type === "generating")
      request.status("이 기기에서 배치 요청을 해석하고 있어요.")
    if (type === "result" || type === "error") {
      clearTimeout(request.timer)
      pending.delete(id)
      if (type === "result" && typeof text === "string") request.resolve(text)
      else
        request.reject(
          new Error(
            "브라우저 AI를 실행하지 못했어요. 다시 시도하거나 규칙 기반 데모를 선택해 주세요."
          )
        )
    }
  }
  worker.onerror = () =>
    resetWorker(
      new Error(
        "브라우저 AI 작업이 중단됐어요. 규칙 기반 데모를 선택할 수 있어요."
      )
    )
  return worker
}

export async function isWebGpuAvailable() {
  const gpu = (
    navigator as Navigator & {
      gpu?: { requestAdapter: () => Promise<unknown> }
    }
  ).gpu
  if (!gpu) return false
  try {
    return Boolean(await gpu.requestAdapter())
  } catch {
    return false
  }
}

export async function generateBrowserIntent(
  project: Project,
  message: string,
  status: (value: string) => void
): Promise<BrowserIntent> {
  if (!(await isWebGpuAvailable()))
    throw new Error(
      "이 브라우저에서는 WebGPU를 사용할 수 없어요. 규칙 기반 데모를 선택해 주세요."
    )
  const id = ++nextId
  const raw = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      resetWorker(
        new Error(
          "모델 준비나 응답이 오래 걸려 중단했어요. 다시 시도해 주세요."
        )
      )
    }, 5 * 60_000)
    pending.set(id, { resolve, reject, status, timer })
    getWorker().postMessage({
      id,
      messages: browserIntentPrompt(project, message),
    })
  })
  return resolveRequestedRotation(
    groundBrowserIntent(project, message, parseBrowserIntent(raw)),
    message
  )
}
