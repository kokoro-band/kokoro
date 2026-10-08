/// <reference types="node" />
import process from "node:process"

import { describe, expect, it } from "vite-plus/test"

import { catalog } from "./data"
import { requestLocalLayoutIntent } from "./local-ai"

// Requires `ollama serve` and `ollama pull qwen3:4b`.
describe.runIf(process.env.KOKORO_LIVE_AI === "1")("local Ollama model", () => {
  const timeout = 120_000

  it.each([
    {
      command: "소파를 치워줘",
      expected: { type: "REMOVE", targetQuery: "소파" },
    },
    {
      command: "모스 소파를 문에서 멀리 하나 놓아줘",
      expected: {
        type: "ADD",
        catalogId: "sofa-moss",
        count: 1,
        anchorQuery: "문",
        relation: "FAR_FROM",
      },
    },
    {
      command: "모스 소파를 문에서 멀리 옮겨줘",
      expected: {
        type: "MOVE",
        targetQuery: "모스 소파",
        anchorQuery: "문",
        relation: "FAR_FROM",
      },
    },
    {
      command: "의자를 치워줘",
      expected: { type: "REMOVE", targetQuery: "의자" },
    },
    {
      command: "창문 가까이에 셸 체어 두 개 추가해줘",
      expected: {
        type: "ADD",
        catalogId: "chair-shell",
        count: 2,
        anchorQuery: "창문",
        relation: "NEAR",
      },
    },
    {
      command: "소파를 치우지 말고 창가로 옮겨줘",
      expected: { type: "MOVE", targetQuery: "소파", anchorQuery: "창가" },
    },
  ])(
    "preserves the requested action in $command",
    async ({ command, expected }) => {
      const intent = await requestLocalLayoutIntent(command, { catalog })
      expect(intent.intents).toEqual([expect.objectContaining(expected)])
    },
    timeout
  )

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
