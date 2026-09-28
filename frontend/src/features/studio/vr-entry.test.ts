// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vite-plus/test"
import { localizeVrEntry } from "./vr-entry"

describe("VR entry guidance", () => {
  it.each([
    ["ENTER VR", "VR로 들어가기", true],
    ["EXIT VR", "VR에서 나가기", true],
    ["VR NOT SUPPORTED", "이 기기는 VR을 지원하지 않아요", false],
    ["VR NOT ALLOWED", "VR 사용 권한이 없어요", false],
    ["WEBXR NEEDS HTTPS", "VR은 HTTPS 주소에서만 열 수 있어요", false],
    ["WEBXR NOT AVAILABLE", "이 브라우저는 WebXR을 지원하지 않아요", false],
  ])(
    "explains %s with an accessible availability state",
    (source, text, ready) => {
      const element = document.createElement("button")
      element.textContent = source
      const stop = localizeVrEntry(element)
      expect(element.textContent).toBe(text)
      expect(element.dataset.state).toBe(ready ? "ready" : "unavailable")
      expect(element.getAttribute("aria-disabled")).toBe(String(!ready))
      stop()
    }
  )

  it("follows asynchronous label changes and stops observing after cleanup", async () => {
    const element = document.createElement("button")
    element.textContent = "ENTER VR"
    const stop = localizeVrEntry(element)
    try {
      element.textContent = "VR NOT ALLOWED"
      await vi.waitFor(() =>
        expect(element.textContent).toBe("VR 사용 권한이 없어요")
      )
      expect(element.getAttribute("aria-disabled")).toBe("true")
      element.textContent = "EXIT VR"
      await vi.waitFor(() => expect(element.textContent).toBe("VR에서 나가기"))
      expect(element.getAttribute("aria-disabled")).toBe("false")
    } finally {
      stop()
    }
    element.textContent = "ENTER VR"
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    expect(element.textContent).toBe("ENTER VR")
  })
})
