import axios, { AxiosError, type AxiosRequestConfig } from "axios"
import { isApiPath, resolveApiBaseUrl } from "./api-url"

const defaultMessage = "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요."
const networkMessage =
  "서버에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요."
export const REQUEST_TIMEOUT_MS = 15_000
export const UPLOAD_TIMEOUT_MS = 60_000
const MAX_ERROR_MESSAGE_LENGTH = 200

const statusMessages: Record<number, string> = {
  401: "로그인이 필요한 요청입니다.",
  403: "이 작업을 할 수 있는 권한이 없어요.",
  404: "프로젝트를 찾지 못했어요.",
  408: "서버 응답이 늦어요. 잠시 후 다시 시도해 주세요.",
  429: "요청이 많아요. 잠시 후 다시 시도해 주세요.",
}

export class ApiError extends Error {
  readonly status: number | null
  readonly retryable: boolean

  constructor(
    message: string,
    status: number | null,
    retryable: boolean,
    cause?: unknown
  ) {
    super(message, { cause })
    this.name = "ApiError"
    this.status = status
    this.retryable = retryable
  }
}

function responseMessage(data: unknown) {
  if (!data || typeof data !== "object") return null
  const { detail, message } = data as { detail?: unknown; message?: unknown }
  const candidate = typeof detail === "string" ? detail : message
  return typeof candidate === "string" && candidate.trim()
    ? candidate.trim().slice(0, MAX_ERROR_MESSAGE_LENGTH)
    : null
}

export function normalizeApiError(error: unknown) {
  if (error instanceof ApiError) return error
  if (!(error instanceof AxiosError))
    return new ApiError(defaultMessage, null, false, error)

  const status = error.response?.status ?? null
  if (status === null) return new ApiError(networkMessage, null, true, error)

  const retryable = status === 408 || status === 429 || status >= 500
  const message =
    statusMessages[status] ??
    responseMessage(error.response?.data) ??
    (status >= 500 ? defaultMessage : "요청을 마치지 못했어요.")
  return new ApiError(message, status, retryable, error)
}

const configuredBaseURL = resolveApiBaseUrl(
  import.meta.env.VITE_API_BASE_URL,
  import.meta.env.DEV,
  typeof window === "undefined" ? undefined : window.location.protocol
)

export const httpClient = axios.create({
  baseURL: configuredBaseURL ?? undefined,
  timeout: REQUEST_TIMEOUT_MS,
})

httpClient.interceptors.request.use((config) => {
  if (
    !configuredBaseURL ||
    config.baseURL !== configuredBaseURL ||
    !isApiPath(config.url)
  )
    throw new ApiError(
      "서버 주소 설정을 확인해 주세요. HTTPS 주소 또는 같은 출처의 API 경로가 필요해요.",
      null,
      false
    )
  config.allowAbsoluteUrls = false
  return config
})

httpClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => Promise.reject(normalizeApiError(error))
)

export async function request<T>(config: AxiosRequestConfig) {
  const response = await httpClient.request<T>(config)
  return response.data
}
