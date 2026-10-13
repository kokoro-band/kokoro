import { request } from "@/lib/http-client"
import { parseBrowserIntent } from "./browser-ai-intent"
import type { BrowserIntent, Project } from "./types"

const keys = ["action", "catalogId", "placement", "rotation", "anchorCatalogId"]
const cancelled = () =>
  new Error("외부 AI 요청을 중단했어요. 배치는 유지했어요.")

export function validateCloudIntent(
  value: unknown,
  project: Project
): BrowserIntent {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== keys.length ||
    !keys.every((key) => Object.hasOwn(value, key))
  )
    throw new Error("외부 AI 응답 형식이 올바르지 않아요. 배치는 유지했어요.")
  const raw = value as Record<string, unknown>
  if (
    raw.rotation !== null &&
    (typeof raw.rotation !== "number" || !Number.isFinite(raw.rotation))
  )
    throw new Error("외부 AI 회전값이 올바르지 않아요. 배치는 유지했어요.")
  const intent = parseBrowserIntent(JSON.stringify(value))
  const movement = intent.action === "ADD" || intent.action === "MOVE"
  if (movement) {
    if (
      !intent.placement ||
      intent.rotation !== null ||
      (intent.placement === "NEAR_TARGET") !== (intent.anchorCatalogId !== null)
    )
      throw new Error("외부 AI 배치 조건이 올바르지 않아요.")
  } else if (intent.action === "ROTATE") {
    if (
      intent.rotation === null ||
      intent.placement !== null ||
      intent.anchorCatalogId !== null
    )
      throw new Error("외부 AI 회전 조건이 올바르지 않아요.")
  } else if (
    intent.placement !== null ||
    intent.rotation !== null ||
    intent.anchorCatalogId !== null
  )
    throw new Error("외부 AI 명령 조건이 올바르지 않아요.")
  const exists = (catalogId: string | null) =>
    project.furniture.some((item) => item.catalogId === catalogId)
  if (
    ["MOVE", "ROTATE", "REMOVE"].includes(intent.action) &&
    !exists(intent.catalogId)
  )
    throw new Error("현재 배치에서 요청한 가구를 찾지 못했어요.")
  if (intent.anchorCatalogId && !exists(intent.anchorCatalogId))
    throw new Error("현재 배치에서 기준 가구를 찾지 못했어요.")
  return intent
}

export async function generateCloudIntent(
  project: Project,
  message: string,
  signal: AbortSignal
): Promise<BrowserIntent> {
  if (signal.aborted) throw cancelled()
  let abort: () => void = () => {}
  const cancellation = new Promise<never>((_, reject) => {
    abort = () => reject(cancelled())
    signal.addEventListener("abort", abort, { once: true })
  })
  try {
    const value = await Promise.race([
      request<unknown>({
        url: "/ai/layout-intent",
        method: "POST",
        signal,
        timeout: 12_000,
        data: {
          message,
          furniture: project.furniture.map(({ catalogId, name }) => ({
            catalogId,
            name,
          })),
        },
      }),
      cancellation,
    ])
    if (signal.aborted) throw cancelled()
    return validateCloudIntent(value, project)
  } finally {
    signal.removeEventListener("abort", abort)
  }
}
