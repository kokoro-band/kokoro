import { AxiosError } from "axios"

import { ApiError, request } from "./http-client"
import { saveSession, type AuthSession } from "./auth-session"

export {
  authRequired,
  currentSession,
  logout,
  subscribeSession,
  type AuthSession,
} from "./auth-session"

const wrongLogin = "아이디 또는 비밀번호가 맞지 않아요."

type LoginResponse = {
  token: string
  username: string
  expiresAt: string | number
}

function toSession(response: LoginResponse): AuthSession {
  const expiresAt =
    typeof response.expiresAt === "number"
      ? response.expiresAt
      : Date.parse(response.expiresAt)
  if (
    typeof response.token !== "string" ||
    typeof response.username !== "string" ||
    !Number.isFinite(expiresAt)
  )
    throw new ApiError("서버 응답을 읽지 못했어요.", null, false)
  const session = {
    token: response.token,
    username: response.username,
    expiresAt,
  }
  saveSession(session)
  return session
}

export async function login(
  username: string,
  password: string
): Promise<AuthSession> {
  let response: LoginResponse
  try {
    response = await request<LoginResponse>({
      method: "POST",
      url: "/auth/login",
      data: { username, password },
    })
  } catch (error) {
    if (error instanceof ApiError && error.status === 401)
      throw new ApiError(wrongLogin, 401, false, error)
    throw error
  }
  return toSession(response)
}

const usernamePattern = /^[a-z0-9_-]{3,32}$/
const MIN_PASSWORD_CHARS = 8
// The server hashes with bcrypt, which reads only the first 72 bytes.
const MAX_PASSWORD_BYTES = 72

/** Same rule as the server: letters in any case, digits, underscore and hyphen, 3 to 32 characters. */
export function usernameError(username: string): string | null {
  return usernamePattern.test(username.trim().toLowerCase())
    ? null
    : "아이디는 영문과 숫자, 밑줄, 하이픈으로 3~32자여야 해요."
}

export function passwordError(password: string): string | null {
  return password.length >= MIN_PASSWORD_CHARS &&
    new TextEncoder().encode(password).length <= MAX_PASSWORD_BYTES
    ? null
    : "비밀번호는 8자 이상이어야 하고 너무 길 수 없어요."
}

export async function signup(
  username: string,
  password: string
): Promise<AuthSession> {
  let response: LoginResponse
  try {
    response = await request<LoginResponse>({
      method: "POST",
      url: "/auth/signup",
      data: { username, password },
    })
  } catch (error) {
    throw withServerReason(error)
  }
  return toSession(response)
}

// The generic message for some statuses (429) hides why sign-up was refused, so prefer the server's reason.
function withServerReason(error: unknown) {
  if (!(error instanceof ApiError) || !(error.cause instanceof AxiosError))
    return error
  const detail = (
    error.cause.response?.data as { detail?: unknown } | undefined
  )?.detail
  return typeof detail === "string" && detail.trim()
    ? new ApiError(
        detail.trim().slice(0, 200),
        error.status,
        error.retryable,
        error
      )
    : error
}
