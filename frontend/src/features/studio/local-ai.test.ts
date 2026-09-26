import { afterEach, describe, expect, it, vi } from "vite-plus/test"

import { catalog, sampleProject } from "./data"
import {
  checkLocalModel,
  interpretLocally,
  LOCAL_AI_URL,
  localMessages,
  parseLayoutIntent,
} from "./local-ai"

const add = {
  action: "ADD",
  catalogId: "sofa-cloud",
  targetQuery: null,
  anchorQuery: null,
  placement: "AUTO",
  distanceM: 0.3,
  rotation: 0,
  count: 1,
}
const plan = {
  reply: "소파를 제안할게요.",
  commands: [add],
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("local model boundary", () => {
  it("parses only supported commands from known catalog entries", () => {
    expect(parseLayoutIntent(plan, catalog)).toEqual({
      ...plan,
      clarification: null,
    })
    for (const patch of [
      { action: "EXEC" },
      { catalogId: "invented" },
      { count: 6 },
      { distanceM: Infinity },
      { rotation: 1.5 },
      { url: "https://example.com" },
    ]) {
      expect(() =>
        parseLayoutIntent(
          { ...plan, commands: [{ ...add, ...patch }] },
          catalog
        )
      ).toThrow()
    }
    expect(() =>
      parseLayoutIntent({ ...plan, code: "alert(1)" }, catalog)
    ).toThrow()
  })

  it("rejects mixed clear commands, missing targets and ambiguous execution", () => {
    const clear = { ...add, action: "CLEAR", catalogId: null }
    expect(() =>
      parseLayoutIntent({ ...plan, commands: [clear, add] }, catalog)
    ).toThrow()
    expect(() =>
      parseLayoutIntent(
        { ...plan, commands: [{ ...add, action: "MOVE" }] },
        catalog
      )
    ).toThrow()
    expect(() =>
      parseLayoutIntent({ ...plan, clarification: "어느 의자인가요?" }, catalog)
    ).toThrow()
    expect(
      parseLayoutIntent(
        { ...plan, reply: "어느 의자인가요?", commands: [] },
        catalog
      ).commands
    ).toEqual([])
  })

  it("never includes project owner, raw floorplan or auth secrets in model context", () => {
    const context = JSON.stringify(
      localMessages(
        "소파 추가",
        {
          ...sampleProject,
          floorPlan: {
            ...sampleProject.floorPlan,
            fileName: "private-blueprint.png",
          },
        },
        catalog
      )
    )
    expect(context).not.toContain("private-blueprint.png")
    expect(context).not.toContain("updatedAt")
    expect(context).not.toContain("modelUrl")
    expect(() =>
      localMessages("x".repeat(2001), sampleProject, catalog)
    ).toThrow()
  })

  it("calls only loopback without credentials and requests structured non-streamed output", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ message: { content: JSON.stringify(plan) } })
        )
      )
    vi.stubGlobal("fetch", fetch)
    expect(await interpretLocally("소파 추가", sampleProject, catalog)).toEqual(
      { ...plan, clarification: null }
    )
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe(`${LOCAL_AI_URL}/api/chat`)
    expect(init.credentials).toBe("omit")
    expect(init.redirect).toBe("error")
    expect(init.headers).toEqual({ "Content-Type": "application/json" })
    const request = JSON.parse(init.body)
    expect(request.stream).toBe(false)
    expect(request.think).toBe(false)
    expect(request.format.additionalProperties).toBe(false)
  })

  it("reports missing models and network/CORS failure without using a remote fallback", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ models: [] })))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
    vi.stubGlobal("fetch", fetch)
    await expect(checkLocalModel()).rejects.toThrow("ollama pull")
    await expect(
      interpretLocally("소파 추가", sampleProject, catalog)
    ).rejects.toThrow("OLLAMA_ORIGINS")
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it("rejects invalid JSON and excessive output without mutating the project", async () => {
    const before = structuredClone(sampleProject)
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response("not json"))
        .mockResolvedValueOnce(new Response("x".repeat(33000)))
    )
    await expect(
      interpretLocally("소파 추가", sampleProject, catalog)
    ).rejects.toThrow()
    await expect(
      interpretLocally("소파 추가", sampleProject, catalog)
    ).rejects.toThrow("너무 커서")
    expect(sampleProject).toEqual(before)
  })

  it("aborts an unfinished local request on timeout", async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener("abort", () =>
              reject(init.signal.reason)
            )
          })
      )
    )
    const assertion = expect(
      interpretLocally("소파 추가", sampleProject, catalog)
    ).rejects.toThrow("시간이 초과")
    await vi.advanceTimersByTimeAsync(90001)
    await assertion
  })
})
