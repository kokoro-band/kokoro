import { catalog } from "./data"
import type { BrowserIntent, Project } from "./types"
export type { BrowserIntent } from "./types"

const actions = new Set([
  "ADD",
  "MOVE",
  "ROTATE",
  "REMOVE",
  "CLEAR",
  "UNSUPPORTED",
])
const placements = new Set([
  "CENTER",
  "NEAR_WINDOW",
  "NEAR_TARGET",
  "LEFT",
  "RIGHT",
  "FRONT",
  "BACK",
])

export function parseBrowserIntent(raw: string): BrowserIntent {
  let value: unknown
  try {
    value = JSON.parse(
      raw
        .trim()
        .replace(/^<think>[\s\S]*?<\/think>\s*/, "")
        .replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, "$1")
    )
  } catch {
    throw new Error(
      "AI가 요청을 읽을 수 있는 형식으로 답하지 않았어요. 다시 요청해 주세요."
    )
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("AI 응답 형식이 올바르지 않아요.")
  const intent = value as Record<string, unknown>
  if (
    Object.keys(intent).some(
      (key) =>
        ![
          "action",
          "catalogId",
          "placement",
          "rotation",
          "anchorCatalogId",
        ].includes(key)
    ) ||
    !actions.has(intent.action as string) ||
    (intent.catalogId != null && typeof intent.catalogId !== "string") ||
    (intent.anchorCatalogId != null &&
      typeof intent.anchorCatalogId !== "string") ||
    (intent.placement != null && !placements.has(intent.placement as string)) ||
    (intent.rotation != null &&
      typeof intent.rotation !== "number" &&
      !(
        typeof intent.rotation === "string" &&
        /^\d+(?:\.\d+)?$/.test(intent.rotation)
      ))
  )
    throw new Error("AI 응답 형식이 올바르지 않아요.")
  const result: BrowserIntent = {
    action: intent.action as BrowserIntent["action"],
    catalogId: (intent.catalogId as string | undefined) ?? null,
    placement:
      (intent.placement as BrowserIntent["placement"] | undefined) ?? null,
    rotation: intent.rotation == null ? null : Number(intent.rotation),
    anchorCatalogId: (intent.anchorCatalogId as string | undefined) ?? null,
  }
  if (result.action === "UNSUPPORTED" || result.action === "CLEAR") {
    if (
      result.catalogId !== null ||
      result.placement !== null ||
      result.rotation !== null ||
      result.anchorCatalogId !== null
    )
      throw new Error("AI 응답 형식이 올바르지 않아요.")
  } else {
    if (!catalog.some((item) => item.id === result.catalogId))
      throw new Error(
        "AI가 카탈로그에 없는 가구를 골랐어요. 배치는 유지했어요."
      )
    if (
      result.rotation !== null &&
      (result.rotation < 0 || result.rotation >= 360)
    )
      throw new Error("AI 응답 형식이 올바르지 않아요.")
  }
  return result
}

export function resolveRequestedRotation(
  intent: BrowserIntent,
  message: string
): BrowserIntent {
  if (intent.action !== "ROTATE") return intent
  const match = message.match(/(-?\d+(?:\.\d+)?)\s*도/)
  if (!match)
    throw new Error("몇 도 돌릴지 숫자로 알려 주세요. 배치는 유지했어요.")
  const degrees = Number(match[1])
  if (!Number.isFinite(degrees)) throw new Error("회전 각도를 읽지 못했어요.")
  return { ...intent, rotation: ((degrees % 360) + 360) % 360 }
}

function mentionedCatalogIds(message: string, anchor: boolean) {
  return catalog
    .filter((item) => {
      const words = [item.name]
      if (item.category === "소파") words.push("소파")
      if (item.category === "테이블") words.push("테이블", "책상")
      if (item.category === "의자") words.push("의자", "체어")
      if (item.id.startsWith("plant-")) words.push("화분", "식물")
      if (item.id.startsWith("lamp-")) words.push("램프", "조명")
      return words.some((word) => {
        const index = message.indexOf(word)
        if (index < 0) return false
        const isAnchor = /^(?:의\s*)?(?:옆|앞|뒤|근처)/.test(
          message.slice(index + word.length).trimStart()
        )
        return isAnchor === anchor
      })
    })
    .map((item) => item.id)
}

function explicitEntities(project: Project, message: string) {
  const targetIds = mentionedCatalogIds(message, false)
  const anchorIds = mentionedCatalogIds(message, true).filter((id) =>
    project.furniture.some((item) => item.catalogId === id)
  )
  return { targetIds, anchorIds }
}

function explicitAction(message: string): BrowserIntent["action"] | null {
  if (/지우지|삭제하지|빼지|없애지|놓지|추가하지|배치하지/.test(message))
    return "UNSUPPORTED"
  const actions = [
    /비우|지우|삭제|빼줘|없애/.test(message) ? "REMOVE" : null,
    /회전|돌려/.test(message) ? "ROTATE" : null,
    /옮|이동/.test(message) ? "MOVE" : null,
    /놓|놔|추가|배치해|배치하/.test(message) ? "ADD" : null,
  ].filter(Boolean) as BrowserIntent["action"][]
  if (actions.length > 1) return "UNSUPPORTED"
  if (actions[0] === "REMOVE" && /모두|전부|전체/.test(message)) return "CLEAR"
  return actions[0] ?? null
}

function explicitPlacement(message: string): BrowserIntent["placement"] {
  if (/창가|창문/.test(message)) return "NEAR_WINDOW"
  if (/왼쪽/.test(message)) return "LEFT"
  if (/오른쪽/.test(message)) return "RIGHT"
  if (/중앙|가운데/.test(message)) return "CENTER"
  return null
}

export function groundBrowserIntent(
  project: Project,
  message: string,
  intent: BrowserIntent
): BrowserIntent {
  const action = explicitAction(message) ?? intent.action
  if (action === "CLEAR" || action === "UNSUPPORTED")
    return {
      action,
      catalogId: null,
      placement: null,
      rotation: null,
      anchorCatalogId: null,
    }
  const { targetIds, anchorIds } = explicitEntities(project, message)
  if (!targetIds.length)
    throw new Error("변경할 가구를 요청에 적어 주세요. 배치는 유지했어요.")
  const availableIds =
    action === "ADD"
      ? targetIds
      : targetIds.filter((id) =>
          project.furniture.some((item) => item.catalogId === id)
        )
  if (targetIds.length && !availableIds.length)
    throw new Error(
      "현재 배치에서 요청한 가구를 찾지 못했어요. 배치는 유지했어요."
    )
  let catalogId = intent.catalogId
  if (availableIds.length === 1) catalogId = availableIds[0]
  else if (availableIds.length && !availableIds.includes(catalogId ?? ""))
    throw new Error("어떤 가구를 바꿀지 정하지 못했어요. 배치는 유지했어요.")
  let anchorCatalogId = intent.anchorCatalogId
  let placement = intent.placement
  if (anchorIds.length && (action === "ADD" || action === "MOVE")) {
    placement = "NEAR_TARGET"
    if (anchorIds.length === 1) anchorCatalogId = anchorIds[0]
    else if (!anchorIds.includes(anchorCatalogId ?? ""))
      throw new Error("기준 가구를 정하지 못했어요. 배치는 유지했어요.")
  } else if (action === "ADD" || action === "MOVE") {
    placement = explicitPlacement(message) ?? placement
  }
  if ((action === "ADD" || action === "MOVE") && !placement)
    placement = "CENTER"
  if (
    (action === "ADD" || action === "MOVE") &&
    placement === "NEAR_TARGET" &&
    !anchorCatalogId
  )
    throw new Error("AI가 기준 가구를 찾지 못했어요. 배치는 유지했어요.")
  return {
    ...intent,
    action,
    catalogId,
    placement: action === "ADD" || action === "MOVE" ? placement : null,
    anchorCatalogId:
      action === "ADD" || action === "MOVE" ? anchorCatalogId : null,
    rotation: action === "ROTATE" ? intent.rotation : null,
  }
}

export function browserIntentPrompt(project: Project, message: string) {
  const furniture = project.furniture.map(({ id, catalogId, name }) => ({
    id,
    catalogId,
    name,
  }))
  const { targetIds, anchorIds } = explicitEntities(project, message)
  const items = catalog
    .filter((item) => (targetIds.length ? targetIds.includes(item.id) : true))
    .map(({ id, name, category }) => ({
      id,
      name,
      category,
    }))
  const anchors = project.furniture
    .filter((item) =>
      anchorIds.length ? anchorIds.includes(item.catalogId) : true
    )
    .map(({ catalogId, name }) => ({ catalogId, name }))
  return [
    {
      role: "system",
      content:
        "너는 가구 배치 요청을 JSON 의도 하나로 분류한다. JSON 객체만 출력한다. 한 번에 한 동작만 선택한다. action은 ADD, MOVE, ROTATE, REMOVE, CLEAR, UNSUPPORTED 중 하나다. catalogId는 대상 가구 후보에서 고르고 anchorCatalogId는 현재 가구 중 기준 가구에서 고른다. placement는 CENTER, NEAR_WINDOW, NEAR_TARGET, LEFT, RIGHT, FRONT, BACK 중 하나다. '소파 옆에 화분'이면 소파는 기준 가구이고 화분은 대상 가구다. 회전 각도는 사용자가 말한 숫자 그대로 쓴다. '90도 회전'이면 rotation은 90이다. 해당 없는 필드는 null로 쓴다. 모호하거나 여러 동작이 섞인 요청은 UNSUPPORTED로 답한다. 좌표를 만들거나 프로젝트를 변경하지 않는다.",
    },
    {
      role: "user",
      content: `대상 가구 후보: ${JSON.stringify(items)}\n현재 가구: ${JSON.stringify(furniture)}\n기준 가구 후보: ${JSON.stringify(anchors)}\n요청: ${message}\n/no_think\nJSON 키: action, catalogId, placement, rotation, anchorCatalogId`,
    },
  ]
}
