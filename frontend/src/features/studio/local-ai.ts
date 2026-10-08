import intentSchemaSource from "../../../../docs/contracts/local-layout-intent.schema.json?raw"

import type { CatalogItem } from "./types"
import type { LocalLayoutIntent, LocalLayoutIntentItem } from "./local-ai-types"

export const localAiUrl = "http://127.0.0.1:11434"
export const localAiModel = "qwen3:4b"
export const LOCAL_AI_TIMEOUT_MS = 60_000

export type {
  LocalLayoutIntent,
  LocalLayoutIntentItem,
  LocalLayoutRelation,
} from "./local-ai-types"

export type LocalAiErrorKind =
  | "model-missing"
  | "unreachable"
  | "blocked"
  | "failed"
  | "timeout"
  | "invalid-response"

const unchanged = "배치는 그대로예요."
const errorMessages: Record<LocalAiErrorKind, string> = {
  "model-missing": `로컬 모델이 설치되지 않았어요. 터미널에서 \`ollama pull ${localAiModel}\`을 실행해 주세요. ${unchanged}`,
  unreachable: `이 PC의 Ollama에 연결하지 못했어요. Ollama를 실행한 뒤 다시 시도해 주세요. 이미 실행 중이라면 주소창의 사이트 설정에서 이 화면의 로컬 네트워크 접근을 허용해 주세요. ${unchanged}`,
  blocked: `브라우저가 Ollama 접근을 막았어요. OLLAMA_ORIGINS에 ${globalThis.location?.origin ?? "이 화면 주소"}를 추가하고 Ollama를 다시 실행해 주세요. ${unchanged}`,
  timeout: `로컬 모델의 응답이 늦어요. 잠시 후 다시 시도해 주세요. ${unchanged}`,
  failed: `로컬 모델이 요청을 처리하지 못했어요. Ollama 로그를 확인한 뒤 다시 시도해 주세요. ${unchanged}`,
  "invalid-response": `로컬 모델이 이해할 수 없는 답을 보냈어요. 요청을 조금 바꿔 다시 시도해 주세요. ${unchanged}`,
}

export class LocalAiError extends Error {
  readonly kind: LocalAiErrorKind

  constructor(kind: LocalAiErrorKind, cause?: unknown) {
    super(errorMessages[kind], { cause })
    this.name = "LocalAiError"
    this.kind = kind
  }
}

const intentFields: Record<
  LocalLayoutIntentItem["type"],
  { required: string[]; optional: string[] }
> = {
  ADD: {
    required: ["catalogId"],
    optional: ["count", "anchorQuery", "relation"],
  },
  MOVE: { required: ["targetQuery"], optional: ["anchorQuery", "relation"] },
  ROTATE: { required: ["targetQuery", "rotation"], optional: [] },
  REMOVE: { required: ["targetQuery"], optional: [] },
  CLEAR: { required: [], optional: [] },
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function hasOnly(value: Record<string, unknown>, fields: string[]) {
  return Object.keys(value).every((key) => fields.includes(key))
}

// Match the schema's code-point limit.
function isQuery(value: unknown) {
  return (
    typeof value === "string" &&
    Array.from(value).length <= 100 &&
    /\S/.test(value)
  )
}

function isIntentItem(value: unknown): value is LocalLayoutIntentItem {
  if (!isRecord(value) || typeof value.type !== "string") return false
  if (!Object.hasOwn(intentFields, value.type)) return false
  const { required, optional } =
    intentFields[value.type as LocalLayoutIntentItem["type"]]
  if (!hasOnly(value, ["type", ...required, ...optional])) return false
  if (!required.every((field) => field in value)) return false
  for (const field of ["targetQuery", "anchorQuery"]) {
    if (field in value && !isQuery(value[field])) return false
  }
  if (
    "relation" in value &&
    (!("anchorQuery" in value) ||
      (value.relation !== "NEAR" && value.relation !== "FAR_FROM"))
  )
    return false
  if (
    "catalogId" in value &&
    (typeof value.catalogId !== "string" ||
      !/^[a-z0-9][a-z0-9-]{0,99}$/.test(value.catalogId))
  )
    return false
  if (
    "count" in value &&
    (!Number.isInteger(value.count) ||
      (value.count as number) < 1 ||
      (value.count as number) > 5)
  )
    return false
  if (
    "rotation" in value &&
    (typeof value.rotation !== "number" ||
      !Number.isFinite(value.rotation) ||
      Math.abs(value.rotation) > 360)
  )
    return false
  return true
}

// Keep validation aligned with docs/contracts/local-layout-intent.schema.json.
export function parseLocalLayoutIntent(value: unknown): LocalLayoutIntent {
  if (
    !isRecord(value) ||
    !hasOnly(value, ["version", "intents"]) ||
    value.version !== 1 ||
    !Array.isArray(value.intents) ||
    value.intents.length < 1 ||
    value.intents.length > 10 ||
    !value.intents.every(isIntentItem)
  ) {
    throw new LocalAiError("invalid-response")
  }
  return { version: 1, intents: value.intents }
}

// parseLocalLayoutIntent checks patterns omitted from Ollama's grammar.
function withoutPatterns(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutPatterns)
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !["pattern", "$schema", "$id"].includes(key))
      .map(([key, entry]) => [key, withoutPatterns(entry)])
  )
}

const replyFormat = withoutPatterns(JSON.parse(intentSchemaSource))

function systemPrompt(catalog: CatalogItem[]) {
  const items = catalog.map(({ id, name, width, depth }) => ({
    id,
    name,
    width,
    depth,
  }))
  return [
    "너는 한국어 가구 배치 명령을 JSON 의도로 바꾸는 변환기다.",
    '{"version":1,"intents":[...]} 형태의 JSON만 답한다.',
    "의도 type은 ADD, MOVE, ROTATE, REMOVE, CLEAR 중 하나다.",
    "먼저 사용자 명령의 동사로 동작을 고른다. 놓아줘/배치해줘/추가해줘는 새 가구를 만드는 ADD, 옮겨줘/이동해줘는 기존 가구의 MOVE, 회전해줘는 ROTATE, 치워줘/빼줘/삭제해줘는 REMOVE다.",
    "가까이/옆에/멀리 같은 위치 표현은 ADD나 MOVE에 붙는 조건이며 동작을 바꾸지 않는다. '문에서 멀리 화분을 하나 놓아줘'는 ADD이고 '화분을 문에서 멀리 옮겨줘'는 MOVE다.",
    "특정 가구를 치워 달라는 요청은 그 가구만 REMOVE한다. '의자를 치워줘'는 REMOVE이며 ADD가 아니다. 모든 가구를 치워 달라는 요청만 CLEAR다.",
    "ADD는 아래 카탈로그의 id를 catalogId로 쓰고 count(1~5)와 anchorQuery를 선택적으로 쓴다.",
    "MOVE는 targetQuery와 선택적 anchorQuery, ROTATE는 targetQuery와 rotation(도), REMOVE는 targetQuery를 쓴다.",
    "ADD와 MOVE는 anchorQuery가 있을 때만 relation을 선택적으로 쓴다. 가까이는 NEAR, 멀리는 FAR_FROM이다. relation을 생략하면 NEAR로 처리한다.",
    "CLEAR는 모든 가구를 지우라는 명령에만 쓴다.",
    "targetQuery와 anchorQuery에는 사용자가 말한 표현을 그대로 쓴다. 좌표나 가구 ID를 지어내지 않는다.",
    "anchorQuery에는 기준물 표현만 쓴다. '문에서 멀리'는 anchorQuery '문'과 relation FAR_FROM으로 나누고, '창문 가까이에'는 anchorQuery '창문'과 relation NEAR로 나눈다.",
    `카탈로그(치수 m): ${JSON.stringify(items)}`,
  ].join("\n")
}

async function originBlocked(fetchImpl: typeof fetch, signal: AbortSignal) {
  // A successful probe maps chat fetch failures to an origin block.
  try {
    await fetchImpl(`${localAiUrl}/api/tags`, {
      mode: "no-cors",
      credentials: "omit",
      signal,
    })
    return true
  } catch {
    return false
  }
}

export async function requestLocalLayoutIntent(
  command: string,
  {
    catalog,
    fetch: fetchImpl = globalThis.fetch.bind(globalThis),
    signal: callerSignal,
  }: {
    catalog: CatalogItem[]
    fetch?: typeof fetch
    signal?: AbortSignal
  }
): Promise<LocalLayoutIntent> {
  const text = command.trim()
  if (!text) throw new Error("배치 요청을 입력해 주세요.")

  const deadline = new AbortController()
  const timer = setTimeout(
    () => deadline.abort(new DOMException("Timed out", "TimeoutError")),
    LOCAL_AI_TIMEOUT_MS
  )
  const signal = callerSignal
    ? AbortSignal.any([callerSignal, deadline.signal])
    : deadline.signal
  try {
    return await chat(text, catalog, fetchImpl, signal)
  } catch (cause) {
    if (callerSignal?.aborted) throw callerSignal.reason
    if (deadline.signal.aborted) throw new LocalAiError("timeout", cause)
    throw cause
  } finally {
    clearTimeout(timer)
  }
}

async function chat(
  text: string,
  catalog: CatalogItem[],
  fetchImpl: typeof fetch,
  signal: AbortSignal
): Promise<LocalLayoutIntent> {
  let response: Response
  try {
    response = await fetchImpl(`${localAiUrl}/api/chat`, {
      method: "POST",
      credentials: "omit",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        model: localAiModel,
        stream: false,
        think: false,
        format: replyFormat,
        options: { temperature: 0 },
        messages: [
          { role: "system", content: systemPrompt(catalog) },
          { role: "user", content: text },
        ],
      }),
    })
  } catch (cause) {
    if (signal.aborted) throw cause
    const blocked = await originBlocked(fetchImpl, signal)
    throw new LocalAiError(blocked ? "blocked" : "unreachable", cause)
  }

  // Propagate body-read aborts so the caller can report timeout or cancellation.
  let body: unknown
  try {
    body = await response.json()
  } catch (cause) {
    if (signal.aborted) throw cause
    body = null
  }
  if (!response.ok) {
    const error = isRecord(body) ? body.error : null
    if (
      response.status === 404 &&
      typeof error === "string" &&
      error.includes("not found")
    )
      throw new LocalAiError("model-missing")
    throw new LocalAiError("failed", error)
  }
  const content =
    isRecord(body) && isRecord(body.message) ? body.message.content : null
  if (typeof content !== "string") throw new LocalAiError("invalid-response")
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch (cause) {
    throw new LocalAiError("invalid-response", cause)
  }
  return parseLocalLayoutIntent(parsed)
}
