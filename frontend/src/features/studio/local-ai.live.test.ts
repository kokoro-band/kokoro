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

  it.each([
    ["셸 체어 두 개 추가해줘", "ADD", "AUTO", null, 2, 0.3],
    [
      "라운드 테이블을 소파 앞쪽에 하나 배치해 줘",
      "ADD",
      "FRONT",
      "소파",
      1,
      0.3,
    ],
    ["샌드 체어 3개를 창가에 놓고 싶어", "ADD", "NEAR_WINDOW", null, 3, 0.3],
    ["선택한 가구를 뒤로 30cm만 옮겨", "MOVE", "OFFSET_BACK", null, 1, 0.3],
  ])(
    "checks additional wording: %s",
    async (message, action, placement, anchor, count, distance) => {
      const result = await interpretLocally(message, sampleProject, catalog)
      expect(result.commands).toHaveLength(1)
      expect(result.commands[0]).toMatchObject({
        action,
        placement,
        count,
        distanceM: distance,
      })
      if (anchor) expect(result.commands[0].anchorQuery).toContain(anchor)
      else expect(result.commands[0].anchorQuery).toBeNull()
    },
    120000
  )
})
