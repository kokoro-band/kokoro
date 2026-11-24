// @vitest-environment happy-dom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"

import { PhotoMeasureError, type measurePhoto } from "../photo-measure"
import type { Furniture } from "../types"
import { PhotoFurnitureDialog } from "./PhotoFurnitureDialog"

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function setup(measure: typeof measurePhoto) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:photo")
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {})
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  cleanups.push(() => {
    act(() => root.unmount())
    container.remove()
  })
  const added: Furniture[] = []
  const openChange = vi.fn()
  act(() =>
    root.render(
      <PhotoFurnitureDialog
        open
        onOpenChange={openChange}
        onAdd={(item) => added.push(item)}
        measure={measure}
      />
    )
  )
  const dialog = () => document.querySelector('[role="dialog"]')!
  const button = (name: string) =>
    [...dialog().querySelectorAll<HTMLButtonElement>("button")].find(
      (item) => item.textContent?.trim() === name
    )
  const field = (label: string) =>
    [...dialog().querySelectorAll<HTMLInputElement>("input")].find((input) =>
      document
        .getElementById(input.getAttribute("aria-labelledby") ?? "")
        ?.textContent?.trim()
        .startsWith(label)
    )!
  return { dialog, button, field, added, openChange }
}

const photo = new File([new Uint8Array([0xff, 0xd8, 0xff])], "fridge.jpg", {
  type: "image/jpeg",
})

function choose(dialog: Element, file = photo) {
  const input = dialog.querySelector<HTMLInputElement>('input[type="file"]')!
  Object.defineProperty(input, "files", { value: [file], configurable: true })
  act(() => {
    input.dispatchEvent(new Event("change", { bubbles: true }))
  })
}

function drawBox(
  dialog: Element,
  from: [number, number],
  to: [number, number]
) {
  const image = dialog.querySelector("img")!
  image.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 300, height: 400 }) as DOMRect
  const frame = image.parentElement!
  const fire = (type: string, [x, y]: [number, number]) =>
    act(() => {
      frame.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          clientX: x,
          clientY: y,
          pointerId: 1,
        })
      )
    })
  fire("pointerdown", from)
  fire("pointermove", to)
  fire("pointerup", to)
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
  })
}

function type(input: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
  act(() => {
    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }))
  })
}

describe("사진으로 가구 추가", () => {
  it("고른 사진과 그린 상자로 재고, 고친 값 그대로 추가한다", async () => {
    const measure = vi.fn(async () => ({
      widthCm: 55.8,
      depthCm: 51.5,
      heightCm: 107.8,
      floorFound: true,
    }))
    const app = setup(measure)
    expect(app.dialog().textContent).toContain("바닥이 같이 보이게")

    choose(app.dialog())
    expect(app.button("크기 재기")?.disabled).toBe(true)
    drawBox(app.dialog(), [30, 100], [270, 400])
    act(() => app.button("크기 재기")!.click())
    await flush()

    expect(measure).toHaveBeenCalledTimes(1)
    const [sent, box] = measure.mock.calls[0] as unknown as [File, number[]]
    expect(sent).toBe(photo)
    expect(box).toEqual([0.1, 0.25, 0.9, 1])
    expect(app.dialog().textContent).toContain("±20%")
    expect(app.field("가로").value).toBe("56")
    expect(app.field("높이").value).toBe("108")

    type(app.field("가로"), "50")
    act(() => app.button("추가하기")!.click())

    expect(app.added).toHaveLength(1)
    expect(app.added[0]).toMatchObject({
      catalogId: "custom-box",
      name: "내 가구",
      category: "기타",
      size: { width: 0.5, depth: 0.52, height: 1.08 },
    })
    expect(app.openChange).toHaveBeenCalledWith(false)
  })

  it("너무 작은 상자로는 재지 않는다", () => {
    const measure = vi.fn()
    const app = setup(measure)
    choose(app.dialog())
    drawBox(app.dialog(), [30, 100], [32, 102])
    expect(app.button("크기 재기")?.disabled).toBe(true)
    expect(app.dialog().textContent).toContain("상자를 그려 주세요")
    expect(measure).not.toHaveBeenCalled()
  })

  it("측정 서버가 꺼져 있으면 안내하고 아무것도 추가하지 않는다", async () => {
    const measure = vi.fn(async () => {
      throw new PhotoMeasureError("offline", "측정 서버에 연결하지 못했어요.")
    })
    const app = setup(measure)
    choose(app.dialog())
    drawBox(app.dialog(), [30, 100], [270, 400])
    act(() => app.button("크기 재기")!.click())
    await flush()

    expect(app.dialog().textContent).toContain("측정 서버에 연결하지 못했어요.")
    expect(app.button("크기 재기")?.disabled).toBe(false)
    expect(app.button("추가하기")).toBeUndefined()
    expect(app.added).toEqual([])
  })

  it("바닥이 안 보였으면 높이가 덜 정확하다고 알린다", async () => {
    const app = setup(
      vi.fn(async () => ({
        widthCm: 100,
        depthCm: 75,
        heightCm: 80,
        floorFound: false,
      }))
    )
    choose(app.dialog())
    drawBox(app.dialog(), [0, 0], [300, 400])
    act(() => app.button("크기 재기")!.click())
    await flush()
    expect(app.dialog().textContent).toContain("높이가 덜 정확할 수 있어요")
  })

  it("재는 중에 닫으면 요청을 취소하고 추가하지 않는다", async () => {
    let signal: AbortSignal | undefined
    const measure = vi.fn(
      (_photo: Blob, _box: unknown, options?: { signal?: AbortSignal }) => {
        signal = options?.signal
        return new Promise<never>(() => {})
      }
    )
    const app = setup(measure as unknown as typeof measurePhoto)
    choose(app.dialog())
    drawBox(app.dialog(), [30, 100], [270, 400])
    act(() => app.button("크기 재기")!.click())
    await flush()

    act(() =>
      app
        .dialog()
        .querySelector<HTMLButtonElement>('[aria-label="닫기"]')!
        .click()
    )
    expect(signal?.aborted).toBe(true)
    expect(app.added).toEqual([])
  })
})
