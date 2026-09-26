import { env } from "node:process"
import { describe, expect, it } from "vite-plus/test"

import { catalog, sampleProject } from "./data"
import { checkLocalModel, interpretLocally } from "./local-ai"

// Explicit opt-in: normal CI never downloads a model or depends on a developer's PC.
describe.skipIf(env.KOKORO_LIVE_AI !== "1")("real user-local Ollama", () => {
  it("finds the locally installed model", async () => {
    expect(await checkLocalModel()).toBe("qwen3:4b")
  })

  it.each([
    ["클라우드 소파 하나 추가해줘", "ADD", "AUTO"],
    ["선택한 가구를 오른쪽으로 50cm 옮겨줘", "MOVE", "OFFSET_RIGHT"],
    ["선택한 가구를 90도 돌려줘", "ROTATE", null],
    ["선택한 가구 삭제해줘", "REMOVE", null],
    ["가구를 모두 삭제해줘", "CLEAR", null],
    ["소파 오른쪽에 올리브 화분 하나 놓아줘", "ADD", "RIGHT"],
  ])(
    "interprets %s using real model weights",
    async (message, action, placement) => {
      const result = await interpretLocally(message, sampleProject, catalog)
      expect(result.clarification).toBeNull()
      expect(result.commands).toHaveLength(1)
      expect(result.commands[0].action).toBe(action)
      if (placement) expect(result.commands[0].placement).toBe(placement)
      if (action === "ROTATE") expect(result.commands[0].rotation).toBe(90)
      if (placement === "OFFSET_RIGHT")
        expect(result.commands[0].distanceM).toBe(0.5)
      if (placement === "RIGHT")
        expect(result.commands[0].anchorQuery).toContain("소파")
    },
    120000
  )
})
