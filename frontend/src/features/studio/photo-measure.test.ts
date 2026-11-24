import { describe, expect, it, vi } from "vite-plus/test"

import { assertFurnitureWrite } from "./project-validation"
import {
  boxFromDrag,
  makeCustomFurniture,
  maxPhotoBytes,
  measurePhoto,
  PhotoMeasureError,
} from "./photo-measure"

const url = "http://measure.test"
const photo = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3])], {
  type: "image/jpeg",
})
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })

async function failure(promise: Promise<unknown>) {
  const error = await promise.catch((caught: unknown) => caught)
  expect(error).toBeInstanceOf(PhotoMeasureError)
  return error as PhotoMeasureError
}

describe("측정 서버 호출", () => {
  it("고른 파일을 그대로 보내고 상자는 0~1 비율로 붙인다", async () => {
    const fetch = vi.fn(async () =>
      json(200, {
        widthCm: 55.8,
        depthCm: 51.5,
        heightCm: 107.8,
        floorFound: true,
      })
    )
    const result = await measurePhoto(photo, [0.1, 0.25, 0.9, 1], {
      fetch,
      url,
    })

    expect(result).toEqual({
      widthCm: 55.8,
      depthCm: 51.5,
      heightCm: 107.8,
      floorFound: true,
    })
    const [target, init] = fetch.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ]
    expect(target).toBe(`${url}/measure?box=0.1,0.25,0.9,1`)
    expect(init.method).toBe("POST")
    expect(init.body).toBe(photo) // 다시 인코딩하지 않아야 EXIF가 남는다
    expect(new Headers(init.headers).get("Content-Type")).toBe("image/jpeg")
  })

  it("서버가 꺼져 있으면 켜 달라고 안내한다", async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch")
    })
    const error = await failure(
      measurePhoto(photo, [0, 0, 1, 1], { fetch, url })
    )
    expect(error.kind).toBe("offline")
    expect(error.message).toContain("측정 서버")
  })

  it("가구를 못 찾으면 서버 문구와 함께 알린다", async () => {
    const fetch = vi.fn(async () =>
      json(422, {
        error: "measure_failed",
        message: "가구 영역을 찾지 못했어요.",
      })
    )
    const error = await failure(
      measurePhoto(photo, [0, 0, 1, 1], { fetch, url })
    )
    expect(error.kind).toBe("measure_failed")
    expect(error.message).toBe("가구 영역을 찾지 못했어요.")
  })

  it("알 수 없는 응답은 숫자로 믿지 않는다", async () => {
    const fetch = vi.fn(async () => json(200, { widthCm: "55" }))
    expect(
      (await failure(measurePhoto(photo, [0, 0, 1, 1], { fetch, url }))).kind
    ).toBe("unknown")
  })

  it("사진이 아니거나 너무 크면 보내기 전에 거부한다", async () => {
    const fetch = vi.fn()
    const text = new Blob(["hello"], { type: "text/plain" })
    expect(
      (await failure(measurePhoto(text, [0, 0, 1, 1], { fetch, url }))).kind
    ).toBe("bad_photo")
    const huge = { size: maxPhotoBytes + 1, type: "image/jpeg" } as Blob
    expect(
      (await failure(measurePhoto(huge, [0, 0, 1, 1], { fetch, url }))).kind
    ).toBe("too_large")
    expect(fetch).not.toHaveBeenCalled()
  })

  it("닫아서 취소하면 측정 오류가 아니라 취소로 끝난다", async () => {
    const controller = new AbortController()
    const fetch = vi.fn(
      (_: unknown, init?: RequestInit) =>
        new Promise<Response>((_, reject) =>
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError"))
          )
        )
    )
    const pending = measurePhoto(photo, [0, 0, 1, 1], {
      fetch,
      url,
      signal: controller.signal,
    })
    controller.abort()
    const error = await pending.catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(DOMException)
    expect((error as DOMException).name).toBe("AbortError")
  })
})

describe("사진 위에 그린 상자", () => {
  const frame = { left: 100, top: 50, width: 400, height: 300 }

  it("화면 좌표를 사진 기준 0~1 비율로 바꾼다", () => {
    expect(boxFromDrag([200, 110], [500, 350], frame)).toEqual([
      0.25, 0.2, 1, 1,
    ])
  })

  it("거꾸로 끌어도 같은 상자가 되고 사진 밖은 가장자리에 맞춘다", () => {
    expect(boxFromDrag([600, 400], [180, 20], frame)).toEqual([0.2, 0, 1, 1])
  })

  it("너무 작은 상자는 만들지 않는다", () => {
    expect(boxFromDrag([200, 100], [205, 300], frame)).toBeNull()
    expect(boxFromDrag([200, 100], [200, 100], frame)).toBeNull()
  })
})

describe("측정값으로 만든 가구", () => {
  it("cm를 m로 바꿔 custom-box 가구로 만든다", () => {
    const item = makeCustomFurniture({
      name: " 냉장고 ",
      category: "기타",
      widthCm: 50,
      depthCm: 56,
      heightCm: 105,
    })
    expect(item).toMatchObject({
      catalogId: "custom-box",
      name: "냉장고",
      category: "기타",
      rotation: 0,
      size: { width: 0.5, depth: 0.56, height: 1.05 },
    })
    expect(() => assertFurnitureWrite([item])).not.toThrow()
  })

  it.each([
    ["4cm", { widthCm: 4 }],
    ["501cm", { heightCm: 501 }],
    ["숫자가 아님", { depthCm: Number.NaN }],
    ["빈 이름", { name: "  " }],
  ])("%s는 만들지 않는다", (_, change) => {
    expect(() =>
      makeCustomFurniture({
        name: "의자",
        category: "의자",
        widthCm: 67,
        depthCm: 59,
        heightCm: 115,
        ...change,
      })
    ).toThrow()
  })
})
