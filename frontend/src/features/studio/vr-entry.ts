const labels: Record<string, { text: string; ready: boolean }> = {
  "ENTER VR": { text: "VR로 들어가기", ready: true },
  "EXIT VR": { text: "VR에서 나가기", ready: true },
  "VR NOT SUPPORTED": { text: "이 기기는 VR을 지원하지 않아요", ready: false },
  "VR NOT ALLOWED": { text: "VR 사용 권한이 없어요", ready: false },
  "WEBXR NEEDS HTTPS": {
    text: "VR은 HTTPS 주소에서만 열 수 있어요",
    ready: false,
  },
  "WEBXR NOT AVAILABLE": {
    text: "이 브라우저는 WebXR을 지원하지 않아요",
    ready: false,
  },
}

/**
 * three.js VRButton은 영어 문구를 직접 바꿔 넣으므로 문구를 한국어로 옮기고
 * 들어갈 수 없는 상태를 data-state로 표시합니다. 반환한 함수로 감시를 멈춥니다.
 */
export function localizeVrEntry(element: HTMLElement) {
  const apply = () => {
    const current = element.textContent?.trim() ?? ""
    const label = labels[current]
    if (!label) return
    element.dataset.state = label.ready ? "ready" : "unavailable"
    element.setAttribute("aria-disabled", String(!label.ready))
    element.textContent = label.text
  }
  apply()
  const observer = new MutationObserver(apply)
  observer.observe(element, {
    childList: true,
    characterData: true,
    subtree: true,
  })
  return () => observer.disconnect()
}
