import { env } from "node:process"
import { describe, expect, it } from "vite-plus/test"
import { interpretLocally } from "./local-ai"
import type { CatalogItem, Project, RoomModel } from "./types"
import type { LayoutChoice, LayoutProposal } from "./layout-proposals"

// Explicit opt-in against the disposable local server. Never writes to a remote endpoint.
const api = "http://127.0.0.1:8081/api"
async function request<T>(
  path: string,
  method = "GET",
  data?: unknown,
  expected = 200
): Promise<T> {
  const options: RequestInit = { method }
  if (data !== undefined) {
    if (method === "GET")
      throw new Error("GET 요청에는 본문을 보내지 않습니다.")
    options.headers = { "Content-Type": "application/json" }
    options.body = JSON.stringify(data)
  }
  const response = await fetch(api + path, options)
  const result = await response.json()
  expect(response.status, JSON.stringify({ result, request: data })).toBe(
    expected
  )
  return result as T
}

describe.skipIf(env.KOKORO_LIVE_APP !== "1")(
  "real local model + Spring + PostgreSQL",
  () => {
    it("previews, confirms, cancels, disambiguates and reloads real Korean requests", async () => {
      let project = await request<Project>(
        "/projects",
        "POST",
        {
          name: `로컬 AI 회귀 ${Date.now()}`,
          roomType: "거실",
          dimensions: { width: 10, depth: 8, height: 2.4 },
        },
        201
      )
      const path = `/projects/${project.id}`
      const room: RoomModel = {
        version: 2,
        unit: "m",
        wallHeight: 2.4,
        bounds: { width: 10, depth: 8 },
        outline: [
          [0, 0],
          [10, 0],
          [10, 8],
          [0, 8],
        ],
        walls: [],
        openings: [],
        rooms: [],
      }
      project = await request<Project>(`${path}/room`, "PUT", {
        room,
        expectedRevision: project.revision,
      })
      const { items } = await request<{ items: CatalogItem[] }>(
        "/furniture-catalog"
      )
      const timings: { text: string; milliseconds: number }[] = []
      async function interpret(text: string) {
        const started = Date.now()
        const intent = await interpretLocally(text, project, items)
        timings.push({ text, milliseconds: Date.now() - started })
        expect(intent.commands.length, JSON.stringify(intent)).toBeGreaterThan(
          0
        )
        return { reply: intent.reply, commands: intent.commands }
      }
      async function preview(text: string) {
        const intent = await interpret(text)
        const proposal = await request<LayoutProposal>(
          `${path}/layout/proposals/intent`,
          "POST",
          {
            expectedRevision: project.revision,
            intent,
          }
        )
        expect(proposal.status).toBe("PENDING")
        expect(await request<Project>(path)).toEqual(project)
        return proposal
      }
      async function confirm(proposal: LayoutProposal) {
        const result = await request<LayoutProposal>(
          `${path}/layout/proposals/${proposal.id}/confirm`,
          "POST"
        )
        expect(result.status).toBe("APPLIED")
        const repeated = await request<LayoutProposal>(
          `${path}/layout/proposals/${proposal.id}/confirm`,
          "POST"
        )
        expect(repeated.result?.revision).toBe(result.result?.revision)
        project = await request<Project>(path)
        expect(project.furniture).toEqual(proposal.proposedFurniture)
      }

      await confirm(await preview("클라우드 소파 하나 추가해줘"))
      await confirm(await preview("소파 오른쪽에 올리브 화분 하나 추가해줘"))
      const sofa = project.furniture.find(
        (item) => item.catalogId === "sofa-cloud"
      )!
      expect(
        project.furniture.find((item) => item.catalogId === "plant-olive")!.x
      ).toBeGreaterThan(sofa.x)
      await confirm(await preview("소파를 왼쪽으로 50cm 옮겨줘"))
      expect(project.furniture.find((item) => item.id === sofa.id)!.x).toBe(
        sofa.x - 0.5
      )
      await confirm(await preview("소파를 90도 돌려줘"))
      expect(
        project.furniture.find((item) => item.id === sofa.id)!.rotation
      ).toBe(90)
      await confirm(await preview("셸 체어 두 개 추가해줘"))
      expect(
        project.furniture.filter((item) => item.catalogId === "chair-shell")
      ).toHaveLength(2)

      const intent = await interpret("의자 하나 삭제해줘")
      const choice = await request<LayoutChoice>(
        `${path}/layout/proposals/intent`,
        "POST",
        {
          expectedRevision: project.revision,
          intent,
        },
        422
      )
      expect(choice.code).toBe("AMBIGUOUS_TARGET")
      expect(choice.candidates).toHaveLength(2)
      const chosen = choice.candidates[1].id
      await confirm(
        await request<LayoutProposal>(
          `${path}/layout/proposals/intent`,
          "POST",
          {
            expectedRevision: project.revision,
            intent,
            choices: { [choice.choiceKey!]: chosen },
          }
        )
      )
      expect(project.furniture.some((item) => item.id === chosen)).toBe(false)

      const removal = await preview("화분을 삭제해줘")
      const cancelled = await request<LayoutProposal>(
        `${path}/layout/proposals/${removal.id}/cancel`,
        "POST"
      )
      expect(cancelled.status).toBe("CANCELLED")
      expect(await request<Project>(path)).toEqual(project)
      await confirm(await preview("가구를 모두 삭제해줘"))
      expect(project.furniture).toHaveLength(0)
      project = await request<Project>(`${path}/room`, "PUT", {
        expectedRevision: project.revision,
        room: {
          ...room,
          walls: [{ id: "north", a: [0, 0], b: [10, 0], thickness: 0.2 }],
          openings: [
            {
              id: "window",
              wallId: "north",
              type: "window",
              from: 4,
              to: 6,
              bottom: 1,
              top: 2,
            },
          ],
        },
      })
      await confirm(await preview("샌드 체어 3개를 창가에 놓고 싶어"))
      expect(project.furniture).toHaveLength(3)
      for (const item of project.furniture) {
        expect(item.catalogId).toBe("chair-sand")
        expect(Math.hypot(item.x - 5, item.z)).toBeLessThanOrEqual(2)
      }
      // Leave only this test's persisted project as inspection evidence.
      console.info(
        JSON.stringify({
          projectId: project.id,
          revision: project.revision,
          timings,
        })
      )
    }, 180000)
  }
)
