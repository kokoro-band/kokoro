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
