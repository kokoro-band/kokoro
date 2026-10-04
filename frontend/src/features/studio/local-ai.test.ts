/// <reference types="node" />
import { readFileSync } from "node:fs"

import { afterEach, describe, expect, it, vi } from "vite-plus/test"

import { catalog } from "./data"
import { parseFurnitureCatalog } from "./furniture-catalog"
import {
  LOCAL_AI_TIMEOUT_MS,
  LocalAiError,
  localAiModel,
  localAiUrl,
  parseLocalLayoutIntent,
  requestLocalLayoutIntent,
} from "./local-ai"

const fixtures = JSON.parse(
  readFileSync(
    new URL(
      "../../../../docs/contracts/fixtures/local-layout-intent.json",
      import.meta.url
    ),
    "utf8"
  )
) as {
  valid: { id: string; intent: unknown }[]
  invalid: { id: string; intent: unknown }[]
}

function chatReply(content: string) {
  return new Response(
    JSON.stringify({
      model: localAiModel,
      message: { role: "assistant", content },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  )
}

function untilAborted(signal: AbortSignal | null | undefined) {
  return new Promise<never>((_resolve, reject) => {
    signal?.addEventListener("abort", () => reject(signal.reason))
  })
}

afterEach(() => {
  vi.useRealTimers()
})

const moveIntent = {
  version: 1,
  intents: [{ type: "MOVE", targetQuery: "소파", anchorQuery: "창가" }],
}

describe("local layout intent contract", () => {
  it.each(fixtures.valid)("accepts $id", ({ intent }) => {
    expect(parseLocalLayoutIntent(intent)).toEqual(intent)
  })

  it.each(fixtures.invalid)("rejects $id", ({ intent }) => {
    expect(() => parseLocalLayoutIntent(intent)).toThrow(LocalAiError)
  })

  it.each([
    ["accepts", 100, true],
    ["rejects", 101, false],
  ])("%s %i astral characters in a query", (_label, length, valid) => {
    const intent = {
      version: 1,
      intents: [{ type: "REMOVE", targetQuery: "🪑".repeat(length) }],
    }
    if (valid) expect(parseLocalLayoutIntent(intent)).toEqual(intent)
    else expect(() => parseLocalLayoutIntent(intent)).toThrow(LocalAiError)
  })
})

describe("requestLocalLayoutIntent", () => {
  it("sends only catalog ids, names and footprints to the local model", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      chatReply(JSON.stringify(moveIntent))
    )

    const intent = await requestLocalLayoutIntent("소파를 창가로 옮겨줘", {
      catalog,
      fetch,
    })

    expect(intent).toEqual(moveIntent)
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe(`${localAiUrl}/api/chat`)
    expect(init?.method).toBe("POST")
    expect(init?.credentials).toBe("omit")
    expect(new Headers(init?.headers).has("Authorization")).toBe(false)
    const body = JSON.parse(init?.body as string)
    expect(body).toMatchObject({ model: localAiModel, stream: false })
    const sent = JSON.stringify(body.messages)
    expect(sent).toContain("소파를 창가로 옮겨줘")
    expect(sent).toContain("sofa-cloud")
    expect(sent).toContain("클라우드 소파")
    for (const item of catalog) {
      expect(sent).not.toContain(item.description)
      if (item.modelUrl) expect(sent).not.toContain(item.modelUrl)
    }
    expect(sent).not.toMatch(/price|color|floorPlan|token/i)
  })

  it("explains a missing model", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(
          JSON.stringify({ error: `model '${localAiModel}' not found` }),
          { status: 404 }
        )
    )

    await expect(
      requestLocalLayoutIntent("의자를 치워줘", { catalog, fetch })
    ).rejects.toMatchObject({
      kind: "model-missing",
      message: expect.stringContaining(`ollama pull ${localAiModel}`),
    })
  })

  it("covers both a stopped Ollama and a browser permission denial when nothing answers", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      throw new TypeError("Failed to fetch")
    })

    const error = await requestLocalLayoutIntent("의자를 치워줘", {
      catalog,
      fetch,
    }).catch((cause: unknown) => cause)

    expect(error).toMatchObject({ kind: "unreachable" })
    expect((error as Error).message).toContain("Ollama를 실행")
    expect((error as Error).message).toContain("로컬 네트워크 접근")
  })

  it("does not blame the connection when Ollama answers with an error", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(JSON.stringify({ error: "out of memory" }), {
          status: 500,
        })
    )

    const error = await requestLocalLayoutIntent("의자를 치워줘", {
      catalog,
      fetch,
    }).catch((cause: unknown) => cause)

    expect(error).toMatchObject({ kind: "failed" })
    expect((error as Error).message).not.toContain("연결")
  })

  it("sends only ids, names and footprints from a server catalog entry", async () => {
    const serverCatalog = parseFurnitureCatalog({
      version: 1,
      unit: "m",
      dimensionKind: "example",
      priceKind: "example",
      currency: "KRW",
      sourceAssetCount: 1,
      items: [
        {
          id: "bench-server",
          name: "서버 벤치",
          category: "의자",
          description: "서버에만 있는 벤치",
          price: 120000,
          width: 1.4,
          depth: 0.4,
          color: "#123456",
          modelUrl: "/models/bench-server.glb",
          provenance: { license: "CC0-1.0", sourceUrl: "https://example.com" },
        },
      ],
    })
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      chatReply(JSON.stringify(moveIntent))
    )

    await requestLocalLayoutIntent("벤치를 놓아줘", {
      catalog: serverCatalog,
      fetch,
    })

    const body = JSON.parse(fetch.mock.calls[0][1]?.body as string)
    expect(body.messages[0].content).toContain(
      JSON.stringify([
        { id: "bench-server", name: "서버 벤치", width: 1.4, depth: 0.4 },
      ])
    )
    expect(JSON.stringify(body)).not.toMatch(
      /서버에만|120000|#123456|bench-server\.glb|provenance|CC0|example\.com/
    )
  })

  it("explains a blocked browser origin when Ollama answers without CORS", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
      if (init?.mode === "no-cors") return new Response(null, { status: 200 })
      throw new TypeError("Failed to fetch")
    })

    await expect(
      requestLocalLayoutIntent("의자를 치워줘", { catalog, fetch })
    ).rejects.toMatchObject({
      kind: "blocked",
      message: expect.stringContaining("OLLAMA_ORIGINS"),
    })
  })

  it.each([
    ["not JSON", "소파를 옮길게요"],
    [
      "coordinates",
      JSON.stringify({
        version: 1,
        intents: [{ type: "MOVE", targetQuery: "소파", x: 1 }],
      }),
    ],
  ])("rejects a reply that is %s", async (_label, content) => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => chatReply(content))

    await expect(
      requestLocalLayoutIntent("소파를 옮겨줘", { catalog, fetch })
    ).rejects.toMatchObject({ kind: "invalid-response" })
  })

  it("does not call the model for an empty command", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()

    await expect(
      requestLocalLayoutIntent("   ", { catalog, fetch })
    ).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
  })

  it("keeps the deadline when the caller passes its own signal", async () => {
    vi.useFakeTimers()
    const fetch = vi.fn<typeof globalThis.fetch>((_url, init) =>
      untilAborted(init?.signal)
    )

    const result = requestLocalLayoutIntent("의자를 치워줘", {
      catalog,
      fetch,
      signal: new AbortController().signal,
    })
    const settled = expect(result).rejects.toMatchObject({ kind: "timeout" })
    await vi.advanceTimersByTimeAsync(LOCAL_AI_TIMEOUT_MS)
    await settled
  })

  it("reports a deadline hit while reading the reply body as a timeout", async () => {
    vi.useFakeTimers()
    const fetch = vi.fn<typeof globalThis.fetch>(
      async (_url, init) =>
        new Response(
          new ReadableStream({
            start(controller) {
              init?.signal?.addEventListener("abort", () =>
                controller.error(init.signal?.reason)
              )
            },
          }),
          { status: 200 }
        )
    )

    const result = requestLocalLayoutIntent("의자를 치워줘", { catalog, fetch })
    const settled = expect(result).rejects.toMatchObject({ kind: "timeout" })
    await vi.advanceTimersByTimeAsync(LOCAL_AI_TIMEOUT_MS)
    await settled
  })

  it("treats a caller abort as cancellation, not a local AI failure", async () => {
    const controller = new AbortController()
    const fetch = vi.fn<typeof globalThis.fetch>((_url, init) =>
      untilAborted(init?.signal)
    )

    const result = requestLocalLayoutIntent("의자를 치워줘", {
      catalog,
      fetch,
      signal: controller.signal,
    })
    controller.abort()

    await expect(result).rejects.toMatchObject({ name: "AbortError" })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
