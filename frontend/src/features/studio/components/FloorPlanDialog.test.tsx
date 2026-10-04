// @vitest-environment happy-dom
import { act, createRef } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { FloorPlanDialog } from "./FloorPlanDialog"
import { sampleProject } from "../data"
import type { Project, UploadAttempt } from "../types"

const mode = vi.hoisted(() => ({ server: true }))
vi.mock("../project-api", () => ({
  get isServerMode() {
    return mode.server
  },
}))
const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  mode.server = true
  vi.unstubAllGlobals()
})

function setup(
  status: Project["floorPlan"]["status"],
  attempt: UploadAttempt | null = null,
  busy = false
) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  cleanups.push(() => {
    act(() => root.unmount())
    container.remove()
  })
  const uploadRef = createRef<HTMLInputElement>()
  const retry = vi.fn()
  const project = {
    ...structuredClone(sampleProject),
    floorPlan: {
      ...sampleProject.floorPlan,
      status,
      progress: status === "PROCESSING" ? 50 : 100,
    },
  }
  act(() =>
    root.render(
      <>
        <input ref={uploadRef} type="file" />
        <FloorPlanDialog
          open
          project={project}
          uploadAttempt={attempt}
          uploadRef={uploadRef}
          busy={busy}
          onOpenChange={() => {}}
          onRetry={retry}
        />
      </>
    )
  )
  const dialog = () => document.querySelector('[role="dialog"]')!
  const button = (name: string) =>
    [...dialog().querySelectorAll<HTMLButtonElement>("button")].find(
      (item) => item.textContent?.trim() === name
    )!
  return { dialog, button, retry, uploadRef }
}
const file = () => new File(["plan"], "내 도면.png", { type: "image/png" })

describe("floor plan status", () => {
  it("calls READY file processing complete and separates existing room dimensions", () => {
    const app = setup("READY")
    expect(app.dialog().textContent).toContain("파일 처리 완료")
    expect(app.dialog().textContent).toContain(
      "방 구조나 실제 치수를 자동으로 추출한 결과는 아니에요"
    )
    expect(app.dialog().textContent).toContain("현재 집 크기")
  })
  it.each([false, true])(
    "does not claim dimension recognition during server processing with attempt=%s",
    (hasAttempt) => {
      const attempt: UploadAttempt | null = hasAttempt
        ? {
            file: file(),
            status: "PROCESSING",
            phase: "CONVERTING",
            progress: 74,
            error: "",
            retryable: true,
          }
        : null
      const app = setup("PROCESSING", attempt, true)
      expect(app.dialog().textContent).toContain("파일을 처리하고 있어요")
      expect(app.dialog().textContent).not.toContain("치수를 읽고")
      expect(app.button("다른 파일 올리기").disabled).toBe(true)
    }
  )
  it("keeps the uploading phase distinct from server processing", () => {
    const app = setup(
      "EMPTY",
      {
        file: file(),
        status: "PROCESSING",
        phase: "UPLOADING",
        progress: 18,
        error: "",
        retryable: true,
      },
      true
    )
    expect(app.dialog().textContent).toContain("올리고 있어요")
    expect(app.dialog().textContent).toContain("18%")
  })
  it("shows retry only for retryable upload failures and invokes it once", () => {
    const app = setup("READY", {
      file: file(),
      status: "FAILED",
      phase: "UPLOADING",
      progress: 0,
      error: "연결이 끊겼어요",
      retryable: true,
    })
    expect(app.dialog().textContent).toContain("연결이 끊겼어요")
    act(() => app.button("같은 파일 다시 올리기").click())
    expect(app.retry).toHaveBeenCalledTimes(1)
  })
  it("does not offer retry for an unsupported file", () => {
    const app = setup("READY", {
      file: file(),
      status: "FAILED",
      phase: "UPLOADING",
      progress: 0,
      error: "지원하지 않는 파일",
      retryable: false,
    })
    expect(app.button("같은 파일 다시 올리기")).toBeUndefined()
    expect(app.button("다른 파일 올리기").disabled).toBe(false)
  })
  it("labels the local example rather than presenting it as a recognized room", () => {
    mode.server = false
    const app = setup("READY")
    expect(app.dialog().textContent).toContain("예제 구조 표시")
    expect(app.dialog().textContent).toContain("예제 집 구조")
    expect(app.dialog().textContent).not.toContain("파일 처리 완료")
  })
})
