// WebXR runtimes may offer an immersive session from the headset's own menu.
type HeadsetSystem = XRSystem & {
  offerSession?: XRSystem["requestSession"]
}

const sessionOptions: XRSessionInit = {
  optionalFeatures: ["local-floor", "bounded-floor", "layers"],
}
let sessionGranted = false
if (
  typeof navigator !== "undefined" &&
  !/WebXRViewer\//i.test(navigator.userAgent)
) {
  navigator.xr?.addEventListener("sessiongranted", () => {
    sessionGranted = true
  })
}

export function mountVrEntry(
  container: HTMLElement,
  renderer: { setSession(session: XRSession): Promise<void> }
) {
  const xr: HeadsetSystem | undefined = navigator.xr
  const status = document.createElement("p")
  status.className = "vr-entry-status"
  status.setAttribute("role", "status")
  const button = document.createElement("button")
  button.className = "xr-entry"
  button.type = "button"
  button.hidden = true
  container.append(status, button)
  let active = true
  let busy = false
  let session: XRSession | null = null
  let checkVersion = 0
  let secureLink: HTMLAnchorElement | undefined

  function show(message: string, action?: string) {
    if (!active) return
    status.textContent = message
    button.hidden = !action
    button.disabled = busy
    if (action) button.textContent = action
  }

  function offer() {
    xr?.offerSession?.("immersive-vr", sessionOptions)
      .then(attachSession)
      .catch(() => {})
  }

  function ended() {
    session?.removeEventListener("end", ended)
    session = null
    busy = false
    if (active) {
      show("", "VR로 들어가기")
      offer()
    }
  }

  async function attachSession(next: XRSession) {
    if (session === next) return
    if (!active || session) {
      await next.end()
      return
    }
    session = next
    next.addEventListener("end", ended)
    try {
      await renderer.setSession(next)
      if (active && session === next) {
        busy = false
        show("", "VR에서 나가기")
      }
    } catch (error) {
      next.removeEventListener("end", ended)
      if (session === next) session = null
      await next.end().catch(() => {})
      throw error
    }
  }

  button.onclick = async () => {
    if (!xr || busy) return
    busy = true
    button.disabled = true
    try {
      if (session) {
        await session.end()
      } else {
        show("헤드셋에서 VR 시작을 확인해 주세요.", "연결 중")
        await attachSession(
          await xr.requestSession("immersive-vr", sessionOptions)
        )
      }
    } catch (error) {
      busy = false
      if (session) {
        show("헤드셋에서 세션 상태를 확인해 주세요.", "VR에서 나가기")
      } else {
        const denied =
          error instanceof DOMException &&
          (error.name === "NotAllowedError" || error.name === "SecurityError")
        show(
          denied
            ? "헤드셋에서 VR 사용 권한을 허용한 뒤 다시 시도해 주세요."
            : "VR 연결을 완료하지 못했어요. 헤드셋 연결을 확인해 주세요.",
          "다시 시도"
        )
      }
    }
  }

  async function checkDevice() {
    if (!xr || busy || session) return
    const version = ++checkVersion
    try {
      const supported = await xr.isSessionSupported("immersive-vr")
      if (!active || version !== checkVersion || busy || session) return
      if (supported) {
        show("", "VR로 들어가기")
        if (sessionGranted) {
          sessionGranted = false
          button.click()
        } else if (version === 1) {
          offer()
        }
      } else {
        show("이 기기는 VR을 지원하지 않아요")
      }
    } catch {
      if (active && version === checkVersion && !busy && !session)
        show("이 브라우저의 VR 사용 권한을 확인해 주세요.")
    }
  }

  if (window.isSecureContext === false) {
    show("VR은 HTTPS 주소에서만 열 수 있어요")
    if (location.protocol === "http:") {
      const url = new URL(location.href)
      url.protocol = "https:"
      secureLink = document.createElement("a")
      secureLink.className = "xr-entry"
      secureLink.href = url.href
      secureLink.textContent = "HTTPS로 열기"
      container.append(secureLink)
    }
  } else if (xr) {
    show("헤드셋 연결을 확인하고 있어요.")
    xr.addEventListener("devicechange", checkDevice)
    void checkDevice()
  } else {
    show("이 브라우저는 WebXR을 지원하지 않아요")
  }
  return () => {
    if (!active) return
    active = false
    xr?.removeEventListener("devicechange", checkDevice)
    session?.removeEventListener("end", ended)
    void session?.end().catch(() => {})
    button.onclick = null
    button.remove()
    status.remove()
    secureLink?.remove()
  }
}
