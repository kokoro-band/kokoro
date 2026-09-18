import axios, { AxiosError, type AxiosRequestConfig } from "axios"

const defaultMessage =
  "서버 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요."
const networkMessage =
  "서버에 연결할 수 없습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요."
export const REQUEST_TIMEOUT_MS = 15_000
export const UPLOAD_TIMEOUT_MS = 60_000
const MAX_ERROR_MESSAGE_LENGTH = 200

const statusMessages: Record<number, string> = {
  401: "로그인이 필요한 요청입니다.",
  403: "이 작업을 수행할 권한이 없습니다.",
  404: "요청한 프로젝트를 찾을 수 없습니다.",
  408: "서버 응답이 늦어 요청을 마치지 못했습니다.",
  429: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
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
    (status >= 500 ? defaultMessage : "요청을 완료할 수 없습니다.")
  return new ApiError(message, status, retryable, error)
}

export const httpClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080/api",
  timeout: REQUEST_TIMEOUT_MS,
})

httpClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => Promise.reject(normalizeApiError(error))
)

export async function request<T>(config: AxiosRequestConfig) {
  const response = await httpClient.request<T>(config)
  return response.data
}
