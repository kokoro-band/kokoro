// @vitest-environment happy-dom
import {
  AxiosError,
  AxiosHeaders,
  type InternalAxiosRequestConfig,
} from "axios"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"

import {
  currentSession,
  login,
  logout,
  passwordError,
  signup,
  usernameError,
} from "./auth"
import { ApiError, httpClient } from "./http-client"

const now = Date.parse("2026-11-01T00:00:00Z")
const future = new Date(now + 3_600_000).toISOString()

function respond(status: number, data: unknown) {
  httpClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    const response = { data, status, statusText: "", headers: {}, config }
    if (status >= 400)
      throw new AxiosError("failed", undefined, config, undefined, response)
    return response
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(now)
  logout()
  localStorage.clear()
})
afterEach(() => {
  vi.useRealTimers()
  localStorage.clear()
  httpClient.defaults.adapter = undefined
})

describe("demo login session", () => {
  it("stores the token after a successful login and restores it", async () => {
    respond(200, { token: "t-1", username: "alice", expiresAt: future })

    const session = await login("alice", "pw")

    expect(session).toMatchObject({ token: "t-1", username: "alice" })
    expect(currentSession()).toMatchObject({ token: "t-1", username: "alice" })
  })

  it("stores nothing and reports the server message for a wrong password", async () => {
    respond(401, { detail: "아이디 또는 비밀번호가 맞지 않아요." })

    await expect(login("alice", "bad")).rejects.toMatchObject({
      status: 401,
      message: "아이디 또는 비밀번호가 맞지 않아요.",
    })

    expect(currentSession()).toBeNull()
    expect(localStorage.length).toBe(0)
  })

  it("treats an expired token as logged out", async () => {
    respond(200, {
      token: "t-old",
      username: "alice",
      expiresAt: new Date(now - 1000).toISOString(),
    })
    await login("alice", "pw")

    expect(currentSession()).toBeNull()
  })

  it("logout removes the token", async () => {
    respond(200, { token: "t-1", username: "alice", expiresAt: future })
    await login("alice", "pw")

    logout()

    expect(currentSession()).toBeNull()
  })

  it("keeps working in memory when browser storage is blocked", async () => {
    respond(200, { token: "t-1", username: "alice", expiresAt: future })
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError")
    })

    await login("alice", "pw")

    expect(currentSession()).toMatchObject({ token: "t-1" })
  })
})

describe("http client authorization", () => {
  it("sends the bearer token on API calls", async () => {
    respond(200, { token: "t-1", username: "alice", expiresAt: future })
    await login("alice", "pw")
    let sent: string | undefined
    httpClient.defaults.adapter = async (config) => {
      sent = AxiosHeaders.from(config.headers).get("Authorization") as string
      return { data: [], status: 200, statusText: "", headers: {}, config }
    }

    await httpClient.get("/projects")

    expect(sent).toBe("Bearer t-1")
  })

  it("clears the session when the server answers 401", async () => {
    respond(200, { token: "t-1", username: "alice", expiresAt: future })
    await login("alice", "pw")
    respond(401, {})

    await expect(httpClient.get("/projects")).rejects.toBeInstanceOf(ApiError)

    expect(currentSession()).toBeNull()
  })
})

describe("sign-up", () => {
  it("stores the session the server returns so the person is signed in", async () => {
    respond(201, { token: "t-new", username: "maker-01", expiresAt: future })

    const session = await signup("Maker-01", "correct-horse")

    expect(session).toMatchObject({ token: "t-new", username: "maker-01" })
    expect(currentSession()).toMatchObject({ token: "t-new" })
  })

  it("reports the server's reason and stores nothing when the name is taken", async () => {
    respond(409, { detail: "이미 사용 중인 아이디예요." })

    await expect(signup("maker-01", "correct-horse")).rejects.toMatchObject({
      status: 409,
      message: "이미 사용 중인 아이디예요.",
    })

    expect(currentSession()).toBeNull()
    expect(localStorage.length).toBe(0)
  })
})

describe("sign-up when accounts are full", () => {
  it("keeps the server's explanation instead of a generic busy message", async () => {
    respond(429, {
      detail: "가입 가능한 계정이 가득 찼어요. 시연 계정으로 로그인해 주세요.",
    })

    await expect(signup("maker-01", "correct-horse")).rejects.toMatchObject({
      status: 429,
      message: expect.stringContaining("가득 찼어요"),
    })
    expect(currentSession()).toBeNull()
  })
})

describe("sign-up rules", () => {
  it.each(["abc", "Maker_01", "a-b-c", "a".repeat(32)])(
    "accepts the username %s",
    (name) => expect(usernameError(name)).toBeNull()
  )

  it.each(["", "ab", "has space", "한글아이디", "a".repeat(33), "bad!name"])(
    "rejects the username %j with a reason",
    (name) => expect(usernameError(name)).toContain("아이디")
  )

  it("accepts a password of 8 characters up to 72 bytes", () => {
    expect(passwordError("12345678")).toBeNull()
    expect(passwordError("p".repeat(72))).toBeNull()
  })

  it.each(["", "1234567", "p".repeat(73), "한".repeat(25)])(
    "rejects the password %j with a reason",
    (password) => expect(passwordError(password)).toContain("비밀번호")
  )
})
