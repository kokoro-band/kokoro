// @vitest-environment happy-dom
import { act } from "react"
import { AxiosError } from "axios"
import { createRoot } from "react-dom/client"
import { afterEach, expect, it, vi } from "vite-plus/test"

import { logout } from "@/lib/auth"
import { httpClient } from "@/lib/http-client"
import { AuthGate } from "./AuthGate"

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  logout()
  localStorage.clear()
  httpClient.defaults.adapter = undefined
  vi.unstubAllGlobals()
})

async function flush() {
  await act(async () => {
    for (let i = 0; i < 40; i++) await Promise.resolve()
  })
}
function mount(required: boolean) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  act(() =>
    root.render(
      <AuthGate required={required}>
        <p>스튜디오 화면</p>
      </AuthGate>
    )
  )
  cleanups.push(() => {
    act(() => root.unmount())
    container.remove()
  })
  return container
}
function type(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )
  act(() => {
    descriptor?.set?.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
}
const httpUrls: string[] = []
function reply(status: number, data: unknown) {
  const calls: unknown[] = []
  httpClient.defaults.adapter = async (config) => {
    httpUrls.push(String(config.url))
    calls.push(JSON.parse(String(config.data)))
    const response = { data, status, statusText: "", headers: {}, config }
    if (status >= 400)
      throw new AxiosError("failed", undefined, config, undefined, response)
    return response
  }
  return calls
}
async function submit(container: HTMLElement, user: string, password: string) {
  type(container.querySelector('input[name="username"]')!, user)
  type(container.querySelector('input[name="password"]')!, password)
  await act(async () => {
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
  })
  await flush()
}

it("shows the studio directly when login is not required", () => {
  const container = mount(false)

  expect(container.textContent).toContain("스튜디오 화면")
  expect(container.querySelector("form")).toBeNull()
})

it("asks for login first and opens the studio after a successful login", async () => {
  const calls = reply(200, {
    token: "t-1",
    username: "alice",
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  })
  const container = mount(true)

  expect(container.textContent).not.toContain("스튜디오 화면")
  expect(container.querySelector('input[type="password"]')).not.toBeNull()
  await submit(container, "alice", "pw")

  expect(calls).toEqual([{ username: "alice", password: "pw" }])
  expect(container.textContent).toContain("스튜디오 화면")
})

it("keeps the login screen and explains a wrong password", async () => {
  reply(401, { detail: "아이디 또는 비밀번호가 맞지 않아요." })
  const container = mount(true)

  await submit(container, "alice", "bad")

  expect(container.textContent).not.toContain("스튜디오 화면")
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "아이디 또는 비밀번호가 맞지 않아요."
  )
})

it("returns to the login screen when the session ends", async () => {
  reply(200, {
    token: "t-1",
    username: "alice",
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  })
  const container = mount(true)
  await submit(container, "alice", "pw")
  expect(container.textContent).toContain("스튜디오 화면")

  act(() => logout())

  expect(container.textContent).not.toContain("스튜디오 화면")
  expect(container.querySelector("form")).not.toBeNull()
})

function buttonWithText(container: HTMLElement, text: string) {
  return [...container.querySelectorAll("button")].find((button) =>
    button.textContent?.includes(text)
  ) as HTMLButtonElement | undefined
}
async function openSignup(container: HTMLElement) {
  await act(async () => buttonWithText(container, "회원가입")!.click())
}
async function submitSignup(
  container: HTMLElement,
  user: string,
  password: string,
  confirm = password
) {
  type(container.querySelector('input[name="username"]')!, user)
  type(container.querySelector('input[name="password"]')!, password)
  type(container.querySelector('input[name="password-confirm"]')!, confirm)
  await act(async () => {
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
  })
  await flush()
}

it("signs a new person up and opens the studio", async () => {
  const calls = reply(201, {
    token: "t-new",
    username: "maker-01",
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  })
  const container = mount(true)
  await openSignup(container)

  await submitSignup(container, "Maker-01", "correct-horse")

  expect(calls).toEqual([{ username: "Maker-01", password: "correct-horse" }])
  expect(httpUrls.at(-1)).toBe("/auth/signup")
  expect(container.textContent).toContain("스튜디오 화면")
})

it("does not call the server when the passwords differ", async () => {
  const calls = reply(201, {})
  const container = mount(true)
  await openSignup(container)

  await submitSignup(container, "maker-01", "correct-horse", "correct-horsf")

  expect(calls).toHaveLength(0)
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "비밀번호가 서로 달라요"
  )
  expect(container.textContent).not.toContain("스튜디오 화면")
})

it.each([
  ["ab", "correct-horse", "아이디"],
  ["maker-01", "short", "비밀번호"],
])(
  "explains an invalid sign-up (%s) before sending anything",
  async (user, password, word) => {
    const calls = reply(201, {})
    const container = mount(true)
    await openSignup(container)

    await submitSignup(container, user, password)

    expect(calls).toHaveLength(0)
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      word
    )
  }
)

it("shows the server's reason when the username is taken", async () => {
  reply(409, { detail: "이미 사용 중인 아이디예요." })
  const container = mount(true)
  await openSignup(container)

  await submitSignup(container, "maker-01", "correct-horse")

  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "이미 사용 중인 아이디예요."
  )
  expect(container.textContent).not.toContain("스튜디오 화면")
})

it("goes back to the login form from sign-up", async () => {
  const container = mount(true)
  await openSignup(container)
  expect(
    container.querySelector('input[name="password-confirm"]')
  ).not.toBeNull()

  await act(async () =>
    buttonWithText(container, "로그인으로 돌아가기")!.click()
  )

  expect(container.querySelector('input[name="password-confirm"]')).toBeNull()
})
