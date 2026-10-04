import { describe, expect, it } from "vite-plus/test"
import { inspectPlanImage } from "./plan-image"
import {
  joinBytes,
  jpegFixture,
  pngChunk,
  pngFixture,
  webpChunk,
  webpContainer,
  webpExtended,
  webpFixture,
} from "./plan-image-fixtures"

describe("plan image metadata gate without pixel decoding", () => {
  it.each([
    ["plan.PNG", "image/png", pngFixture()],
    ["plan.jpg", "image/jpeg", jpegFixture()],
    ["plan.jpeg", "image/jpeg", jpegFixture(200, 200, true)],
    ["plan.webp", "image/webp", webpFixture()],
    ["plan.webp", "image/webp", webpFixture(200, 200, "VP8L")],
    ["plan.webp", "image/webp", webpExtended()],
  ])("reads %s with bounded header metadata", (name, mime, bytes) => {
    expect(inspectPlanImage(bytes, name, mime)).toEqual({
      width: 200,
      height: 200,
    })
  })
  it.each([
    ["png", "image/png", pngFixture],
    ["jpg", "image/jpeg", jpegFixture],
    ["webp", "image/webp", webpFixture],
    ["webp", "image/webp", webpExtended],
  ] as const)(
    "accepts 16M pixels but rejects more in %s",
    (extension, mime, fixture) => {
      expect(
        inspectPlanImage(fixture(4000, 4000), `plan.${extension}`, mime)
      ).toEqual({ width: 4000, height: 4000 })
      expect(() =>
        inspectPlanImage(fixture(4001, 4000), `plan.${extension}`, mime)
      ).toThrow("1600만")
    }
  )
  it.each([0, 65536, 0xffffffff])(
    "rejects unsafe PNG dimensions %s",
    (size) => {
      expect(() =>
        inspectPlanImage(pngFixture(size, size), "plan.png", "image/png")
      ).toThrow()
    }
  )
  it.each([
    ["plan.png", "image/png", jpegFixture()],
    ["plan.jpg", "image/png", pngFixture()],
    ["plan", "image/png", pngFixture()],
    ["plan.webp", "image/webp", new Uint8Array(0)],
    ["plan.png", "", pngFixture()],
  ])("rejects mismatched format %s %s", (name, mime, bytes) => {
    expect(() => inspectPlanImage(bytes, name, mime)).toThrow("파일")
  })
  it("rejects every truncated PNG and WebP container without leaking range errors", () => {
    for (const [bytes, extension] of [
      [pngFixture(), "png"],
      [webpFixture(), "webp"],
    ] as const) {
      for (let length = 0; length < bytes.length; length++) {
        expect(() =>
          inspectPlanImage(
            bytes.slice(0, length),
            `plan.${extension}`,
            `image/${extension}`
          )
        ).toThrow("파일")
      }
    }
  })
  it("rejects animations even when only an unexpected animation chunk is present", () => {
    expect(() =>
      inspectPlanImage(pngFixture(200, 200, true), "plan.png", "image/png")
    ).toThrow("정지 이미지")
    expect(() =>
      inspectPlanImage(webpExtended(200, 200, 2), "plan.webp", "image/webp")
    ).toThrow("정지 이미지")
    expect(() =>
      inspectPlanImage(
        webpContainer(
          webpFixture().slice(12),
          webpChunk("ANMF", new Uint8Array())
        ),
        "plan.webp",
        "image/webp"
      )
    ).toThrow("정지 이미지")
  })
  it("checks both WebP canvas and bitstream sizes and rejects conflicting dimensions", () => {
    expect(() =>
      inspectPlanImage(
        webpExtended(2, 4000, 0, 5000),
        "plan.webp",
        "image/webp"
      )
    ).toThrow("1600만")
    expect(() =>
      inspectPlanImage(
        webpExtended(200, 200, 0, 100),
        "plan.webp",
        "image/webp"
      )
    ).toThrow("파일")
    expect(() =>
      inspectPlanImage(
        webpContainer(webpFixture().slice(12), webpFixture().slice(12)),
        "plan.webp",
        "image/webp"
      )
    ).toThrow("파일")
  })
  it("rejects duplicate PNG headers and oversized chunk lengths", () => {
    const bytes = pngFixture()
    expect(() =>
      inspectPlanImage(
        joinBytes(bytes.slice(0, 33), bytes.slice(8)),
        "plan.png",
        "image/png"
      )
    ).toThrow("파일")
    new DataView(bytes.buffer).setUint32(33, 0xffffffff)
    expect(() => inspectPlanImage(bytes, "plan.png", "image/png")).toThrow(
      "파일"
    )
  })
  it("bounds compressed file bytes and the number of metadata chunks", () => {
    expect(() =>
      inspectPlanImage(
        new Uint8Array(15 * 1024 * 1024 + 1),
        "plan.png",
        "image/png"
      )
    ).toThrow("15MiB")
    const png = pngFixture()
    const exactLimit = joinBytes(
      png.slice(0, 33),
      pngChunk("tEXt", new Uint8Array(15 * 1024 * 1024 - png.length - 12)),
      png.slice(33)
    )
    expect(exactLimit.length).toBe(15 * 1024 * 1024)
    expect(inspectPlanImage(exactLimit, "plan.png", "image/png")).toEqual({
      width: 200,
      height: 200,
    })
    const excessive = joinBytes(
      png.slice(0, 33),
      ...Array.from({ length: 4096 }, () => pngChunk("tEXt")),
      png.slice(33)
    )
    expect(() => inspectPlanImage(excessive, "plan.png", "image/png")).toThrow(
      "파일"
    )
  })
  it("rejects malformed JPEG segments and missing frame size before scan", () => {
    const jpeg = jpegFixture()
    jpeg[4] = 255
    expect(() => inspectPlanImage(jpeg, "plan.jpg", "image/jpeg")).toThrow(
      "파일"
    )
    expect(() =>
      inspectPlanImage(
        joinBytes(new Uint8Array([255, 216]), jpegFixture().slice(15)),
        "plan.jpg",
        "image/jpeg"
      )
    ).toThrow("파일")
  })

  it("rejects every JPEG prefix before the complete SOS header", () => {
    const jpeg = jpegFixture()
    for (let length = 0; length < 25; length++) {
      expect(() =>
        inspectPlanImage(jpeg.slice(0, length), "plan.jpg", "image/jpeg")
      ).toThrow("파일")
    }
  })
})
