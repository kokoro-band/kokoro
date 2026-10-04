/// <reference types="node" />
import process from "node:process"

import { describe, expect, it } from "vite-plus/test"

import { catalog } from "./data"
import { requestLocalLayoutIntent } from "./local-ai"

// Requires `ollama serve` and `ollama pull qwen3:4b`.
describe.runIf(process.env.KOKORO_LIVE_AI === "1")("local Ollama model", () => {
  const timeout = 120_000

  it(
    "adds a catalog item by name",
    async () => {
      const intent = await requestLocalLayoutIntent("모스 소파를 하나 놓아줘", {
        catalog,
      })
      expect(intent.intents).toContainEqual(
        expect.objectContaining({ type: "ADD", catalogId: "sofa-moss" })
      )
    },
    timeout
  )

  it(
    "moves placed furniture by the user's words without coordinates",
    async () => {
      const intent = await requestLocalLayoutIntent("소파를 창가로 옮겨줘", {
        catalog,
      })
      expect(intent.intents[0]).toMatchObject({
        type: "MOVE",
        targetQuery: expect.stringContaining("소파"),
      })
    },
    timeout
  )

  it(
    "clears the room",
    async () => {
      const intent = await requestLocalLayoutIntent("가구를 전부 치워줘", {
        catalog,
      })
      expect(intent.intents).toEqual([{ type: "CLEAR" }])
    },
    timeout
  )
})
