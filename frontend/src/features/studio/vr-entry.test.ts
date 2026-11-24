// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { mountVrEntry } from "./vr-entry"

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((dispose) => dispose())
  vi.unstubAllGlobals()
})

function setup(supported = true, hasXr = true) {
  const session = Object.assign(new EventTarget(), {
    end: vi.fn(async () => {
      session.dispatchEvent(new Event("end"))
    }),
  })
  const xr = Object.assign(new EventTarget(), {
    isSessionSupported: vi.fn(async () => supported),
    requestSession: vi.fn(async () => session),
  })
  vi.stubGlobal("navigator", { xr: hasXr ? xr : undefined })
  vi.stubGlobal("isSecureContext", true)
  const host = document.createElement("div")
  const renderer = { setSession: vi.fn(async () => {}) }
  const stop = mountVrEntry(host, renderer)
  cleanups.push(stop)
  return {
    host,
    renderer,
    stop,
    session,
    xr,
    button: host.querySelector("button")!,
    status: host.querySelector('[role="status"]')!,
  }
}

describe("VR entry", () => {
  it("allows one request per click sequence, ends a session and resets the action", async () => {
    const { button, xr, renderer, session } = setup()
    await vi.waitFor(() => expect(button.textContent).toBe("VR로 들어가기"))
    button.click()
    button.click()
    expect(button.disabled).toBe(true)
    await vi.waitFor(() => expect(button.textContent).toBe("VR에서 나가기"))
    expect(xr.requestSession).toHaveBeenCalledTimes(1)
    expect(renderer.setSession).toHaveBeenCalledWith(session)
    button.click()
    await vi.waitFor(() => expect(button.textContent).toBe("VR로 들어가기"))
    expect(session.end).toHaveBeenCalledOnce()
  })

  it("allows retry after a declined headset permission", async () => {
    const { button, status, xr } = setup()
    await vi.waitFor(() => expect(button.hidden).toBe(false))
    xr.requestSession.mockRejectedValueOnce(
      new DOMException("Denied", "NotAllowedError")
    )
    button.click()
    await vi.waitFor(() => expect(button.textContent).toBe("다시 시도"))
    expect(status.textContent).toContain("사용 권한")
    button.click()
    await vi.waitFor(() => expect(button.textContent).toBe("VR에서 나가기"))
  })

  it("announces an unavailable device and reacts when a headset connects", async () => {
    const { button, status, xr } = setup(false)
    await vi.waitFor(() =>
      expect(status.textContent).toContain("이 기기는 VR을 지원하지 않아요")
    )
    expect(button.hidden).toBe(true)
    xr.isSessionSupported.mockResolvedValueOnce(true)
    xr.dispatchEvent(new Event("devicechange"))
    await vi.waitFor(() => expect(button.hidden).toBe(false))
  })

  it("does not expose a dead WebXR link in an unsupported browser", () => {
    const { host, button, status } = setup(false, false)
    expect(status.textContent).toContain(
      "이 브라우저는 WebXR을 지원하지 않아요"
    )
    expect(button.hidden).toBe(true)
    expect(host.querySelector("a")).toBeNull()
  })

  it("recovers when the browser cannot bind a granted session to the renderer", async () => {
    const { button, renderer, session, status } = setup()
    renderer.setSession.mockRejectedValueOnce(
      new Error("graphics device unavailable")
    )
    await vi.waitFor(() => expect(button.hidden).toBe(false))
    button.click()
    await vi.waitFor(() => expect(button.textContent).toBe("다시 시도"))
    expect(session.end).toHaveBeenCalledOnce()
    expect(status.textContent).toContain("VR 연결을 완료하지 못했어요")
  })

  it("explains the HTTPS requirement before trying to open an immersive session", () => {
    vi.stubGlobal("isSecureContext", false)
    const host = document.createElement("div")
    const stop = mountVrEntry(host, { setSession: vi.fn() })
    expect(host.querySelector('[role="status"]')?.textContent).toContain(
      "HTTPS"
    )
    expect(host.querySelector("button")!.hidden).toBe(true)
    stop()
  })

  it("ends a late session that resolves after navigating away", async () => {
    const { button, host, session, xr, renderer, stop } = setup()
    await vi.waitFor(() => expect(button.hidden).toBe(false))
    let finish!: (value: typeof session) => void
    xr.requestSession.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    button.click()
    stop()
    finish(session)
    await vi.waitFor(() => expect(session.end).toHaveBeenCalledOnce())
    expect(renderer.setSession).not.toHaveBeenCalled()
    expect(host.children).toHaveLength(0)
  })
})
