// @vitest-environment happy-dom
import { act, StrictMode, useState } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { draftAreaPyeong } from "../room-builder"
import { pngFixture } from "../plan-image-fixtures"
import { PlanImport } from "./PlanImport"

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

// Only browser decoding and drawing are substituted. Room analysis stays real.
function setup() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
  const images: ControlledImage[] = []
  class ControlledImage {
    width = 200
    height = 200
    src = ""
    room = true
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    constructor() {
      images.push(this)
    }
  }
  vi.stubGlobal("Image", ControlledImage)
  vi.spyOn(URL, "createObjectURL").mockImplementation(
    () => `blob:plan-${images.length}`
  )
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {})
  const sources = new WeakMap<HTMLCanvasElement, ControlledImage>()
  const readPixels = vi.fn(
    (
      canvas: HTMLCanvasElement,
      x: number,
      y: number,
      width: number,
      height: number
    ) => {
      const data = new Uint8ClampedArray(width * height * 4).fill(255)
      if (sources.get(canvas)?.room) {
        for (let row = 0; row < height; row++) {
          for (let col = 0; col < width; col++) {
            const px = x + col
            const py = y + row
            const inside = px >= 20 && px < 180 && py >= 20 && py < 180
            const wall =
              inside && (px < 26 || px >= 174 || py < 26 || py >= 174)
            if (wall)
              data.fill(0, (row * width + col) * 4, (row * width + col) * 4 + 3)
          }
        }
      }
      return { data, width, height, colorSpace: "srgb" } as ImageData
    }
  )
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    function (this: HTMLCanvasElement) {
      return {
        fillRect() {},
        strokeRect() {},
        fillText() {},
        drawImage: (source: ControlledImage | HTMLCanvasElement) => {
          const decoded =
            source instanceof ControlledImage ? source : sources.get(source)
          if (decoded) sources.set(this, decoded)
        },
        getImageData: (x: number, y: number, width: number, height: number) =>
          readPixels(this, x, y, width, height),
      } as unknown as CanvasRenderingContext2D
    }
  )
  const imported = vi.fn()
  const blank = vi.fn()
  const closed = vi.fn()
  function Harness() {
    const [open, setOpen] = useState(true)
    return open ? (
      <PlanImport
        initialArea={20}
        onImport={imported}
        onDrawBlank={blank}
        onClose={() => {
          closed()
          setOpen(false)
        }}
      />
    ) : null
  }
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  let mounted = true
  const unmount = () => {
    if (!mounted) return
    act(() => root.unmount())
    container.remove()
    mounted = false
  }
  cleanups.push(unmount)
  act(() =>
    root.render(
      <StrictMode>
        <Harness />
      </StrictMode>
    )
  )
  const button = (name: string) => {
    const found = [...document.querySelectorAll("button")].find(
      (node) =>
        node.textContent?.trim() === name ||
        node.getAttribute("aria-label") === name
    )
    expect(found, `button ${name}`).toBeDefined()
    return found!
  }
  const choose = (file?: File) => {
    const input =
      document.querySelector<HTMLInputElement>('input[type="file"]')!
    Object.defineProperty(input, "files", {
      configurable: true,
      value: file ? [file] : [],
    })
    act(() => {
      input.dispatchEvent(new Event("change", { bubbles: true }))
    })
  }
  const decode = async (index = images.length - 1, room = true) => {
    await act(async () => {
      images[index].room = room
      images[index].onload?.()
    })
  }
  const analyze = async () => {
    await act(async () => {
      vi.advanceTimersByTime(30)
    })
  }
  return {
    images,
    imported,
    blank,
    closed,
    revoke,
    readPixels,
    button,
    choose,
    decode,
    analyze,
    unmount,
    click: (name: string) => act(() => button(name).click()),
    text: () => document.body.textContent ?? "",
    async valid() {
      choose(new File(["png"], "plan.png", { type: "image/png" }))
      await decode()
      await analyze()
      expect(button("이 배치로 시작").disabled).toBe(false)
    },
    async failDecode(index = images.length - 1) {
      await act(async () => images[index].onerror?.())
    },
    area(value: string) {
      const input = document.querySelector<HTMLInputElement>(
        'input[inputmode="decimal"]'
      )!
      act(() => {
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value"
        )!.set!.call(input, value)
        input.dispatchEvent(new Event("input", { bubbles: true }))
      })
      act(() => {
        input.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
        )
      })
    },
    drop(file: File) {
      const target = document.querySelector(".plan-import-drop")!
      const event = new Event("drop", { bubbles: true, cancelable: true })
      Object.defineProperty(event, "dataTransfer", { value: { files: [file] } })
      act(() => {
        target.dispatchEvent(event)
      })
    },
  }
}

const png = (name = "plan.png") =>
  new File(["png"], name, { type: "image/png" })

describe("PlanImport file recovery with real SEED and analysis", () => {
  it.each([
    ["large", pngFixture(4001, 4000), "1600만"],
    ["fake", new TextEncoder().encode("not a PNG"), "파일"],
    ["animated", pngFixture(200, 200, true), "정지 이미지"],
  ])("rejects %s before allocating a decoder and keeps the valid draft", async (_label, bytes, message) => {
    const ui = setup()
    await ui.valid()
    await act(async () => {
      ui.choose(new File([bytes as Uint8Array<ArrayBuffer>], "other.png", { type: "image/png" }))
    })
    expect(ui.images).toHaveLength(1)
    expect(ui.text()).toContain(message)
    expect(ui.button("이 배치로 시작").disabled).toBe(false)
  })
  it.each(["image/png", "image/jpeg", "image/webp"])(
    "accepts %s at the 15MB boundary",
    async (type) => {
      const ui = setup()
      const file = new File(["image"], "plan", { type })
      Object.defineProperty(file, "size", { value: 15 * 1024 * 1024 })
      ui.choose(file)
      await ui.decode()
      await ui.analyze()
      expect(ui.button("이 배치로 시작").disabled).toBe(false)
    }
  )
  it("ignores an already resolved image promise when a new file arrives before its continuation", async () => {
    const ui = setup()
    ui.choose(png("old.png"))
    await act(async () => {
      ui.images[0].room = false
      ui.images[0].onload?.()
      ui.choose(png("new.png"))
    })
    expect(ui.readPixels).not.toHaveBeenCalled()
    await ui.decode(1)
    await ui.analyze()
    expect(ui.button("이 배치로 시작").disabled).toBe(false)
  })
  it("releases the image URL immediately when closing during decoding", async () => {
    const ui = setup()
    ui.choose(png())
    ui.click("닫기")
    expect(ui.revoke).toHaveBeenCalledOnce()
    expect(ui.images[0].src).toBe("")
    await ui.decode()
    await ui.analyze()
    expect(ui.readPixels).not.toHaveBeenCalled()
  })
  it("preserves a selected crop when rejecting another file", async () => {
    const ui = setup()
    await ui.valid()
    const canvas = document.querySelector("canvas")!
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 200,
      bottom: 200,
      width: 200,
      height: 200,
      toJSON() {},
    })
    canvas.setPointerCapture = vi.fn()
    act(() => {
      canvas.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          pointerId: 1,
          clientX: 30,
          clientY: 30,
        })
      )
    })
    act(() => {
      canvas.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          pointerId: 1,
          clientX: 130,
          clientY: 130,
        })
      )
    })
    act(() => {
      canvas.dispatchEvent(
        new PointerEvent("pointerup", { bubbles: true, pointerId: 1 })
      )
    })
    expect(ui.text()).toContain("고른 영역 100 × 100px")
    ui.choose(new File(["pdf"], "bad.pdf", { type: "application/pdf" }))
    expect(ui.text()).toContain("고른 영역 100 × 100px")
    expect(ui.button("고른 영역에서 찾기").disabled).toBe(false)
  })
  it("keeps the valid draft when the file picker is cancelled", async () => {
    const ui = setup()
    await ui.valid()
    ui.choose()
    ui.click("이 배치로 시작")
    expect(ui.imported).toHaveBeenCalledOnce()
    expect(ui.images).toHaveLength(1)
  })
  it.each(["type", "size"])(
    "preserves a valid result after rejecting invalid %s",
    async (invalid) => {
      const ui = setup()
      await ui.valid()
      const file =
        invalid === "type"
          ? new File(["pdf"], "bad.pdf", { type: "application/pdf" })
          : png()
      if (invalid === "size")
        Object.defineProperty(file, "size", { value: 15 * 1024 * 1024 + 1 })
      ui.choose(file)
      expect(ui.text()).toContain(
        invalid === "type" ? "PNG, JPG, WebP 이미지만" : "15MB 이하"
      )
      expect(ui.button("이 배치로 시작").disabled).toBe(false)
      ui.click("이 배치로 시작")
      expect(ui.imported).toHaveBeenCalledOnce()
      expect(ui.images).toHaveLength(1)
    }
  )
  it("recovers after a decoding failure and releases decoded image URLs", async () => {
    const ui = setup()
    ui.choose(png())
    await ui.failDecode()
    expect(ui.text()).toContain("이미지를 읽지 못했어요")
    expect(ui.button("도면 이미지 고르기").disabled).toBe(false)
    await ui.valid()
    ui.click("이 배치로 시작")
    expect(ui.imported).toHaveBeenCalledOnce()
    expect(ui.revoke).toHaveBeenCalledTimes(2)
  })
  it("shows retry and blank drawing after no rooms are found", async () => {
    const ui = setup()
    ui.choose(png())
    await ui.decode(0, false)
    await ui.analyze()
    expect(ui.text()).toContain("방을 찾지 못했어요")
    expect(ui.button("이 배치로 시작").disabled).toBe(true)
    ui.click("다시 찾기")
    await ui.analyze()
    expect(ui.text()).toContain("방을 찾지 못했어요")
    ui.click("빈 집에서 그리기")
    expect(ui.blank).toHaveBeenCalledOnce()
    expect(ui.imported).not.toHaveBeenCalled()
  })
  it.each(["success", "failure"])(
    "ignores an older image %s after a newer dropped file",
    async (outcome) => {
      const ui = setup()
      ui.drop(png("old.png"))
      ui.drop(png("new.png"))
      await ui.decode(1)
      await ui.analyze()
      expect(ui.button("이 배치로 시작").disabled).toBe(false)
      if (outcome === "success") {
        await ui.decode(0, false)
        await ui.analyze()
      } else await ui.failDecode(0)
      expect(ui.button("이 배치로 시작").disabled).toBe(false)
      expect(ui.text()).not.toContain("읽지 못했어요")
      expect(ui.text()).not.toContain("방을 찾지 못했어요")
    }
  )
  it("uses the latest committed area when decoding finishes", async () => {
    const ui = setup()
    ui.choose(png())
    ui.area("30")
    await ui.decode()
    await ui.analyze()
    ui.click("이 배치로 시작")
    const [draft, area] = ui.imported.mock.calls[0]
    expect(area).toBe(30)
    expect(draftAreaPyeong(draft)).toBeCloseTo(30, 0)
  })
  it("invalidates an analysis when area changes and retries with the latest area", async () => {
    const ui = setup()
    ui.choose(png())
    await ui.decode()
    ui.area("30")
    await ui.analyze()
    expect(ui.button("이 배치로 시작").disabled).toBe(true)
    ui.click("다시 찾기")
    await ui.analyze()
    ui.click("이 배치로 시작")
    const [draft, area] = ui.imported.mock.calls[0]
    expect(area).toBe(30)
    expect(draftAreaPyeong(draft)).toBeCloseTo(30, 0)
  })
  it("turns a canvas read failure during analysis into a recoverable error", async () => {
    const ui = setup()
    ui.choose(png())
    await ui.decode()
    ui.readPixels.mockImplementationOnce(() => {
      throw new Error("canvas read failed")
    })
    await ui.analyze()
    expect(ui.text()).toContain("이미지를 읽지 못했어요")
    ui.click("다시 찾기")
    await ui.analyze()
    expect(ui.button("이 배치로 시작").disabled).toBe(false)
  })
  it("cancels scheduled analysis when the dialog closes", async () => {
    const ui = setup()
    ui.choose(png())
    await ui.decode()
    const reads = ui.readPixels.mock.calls.length
    ui.click("닫기")
    await ui.analyze()
    expect(ui.closed).toHaveBeenCalledOnce()
    expect(ui.readPixels).toHaveBeenCalledTimes(reads)
    expect(ui.imported).not.toHaveBeenCalled()
  })
  it("does not analyze an image that finishes decoding after unmount", async () => {
    const ui = setup()
    ui.choose(png())
    ui.unmount()
    await ui.decode()
    await ui.analyze()
    expect(ui.readPixels).not.toHaveBeenCalled()
    expect(ui.revoke).toHaveBeenCalledOnce()
  })
})
