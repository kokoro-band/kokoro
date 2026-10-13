import {
  expect,
  test as base,
  type Page,
  type BrowserContext,
} from "@playwright/test"
import type { Project } from "../../src/features/studio/types"

export const storageKey = "kokoro-remodel-project-v1"
export const initialProject: Project = {
  id: "local-ai-e2e",
  name: "브라우저 AI E2E",
  roomType: "주택",
  dimensions: { width: 8, depth: 6, height: 2.4 },
  room: {
    version: 2,
    unit: "m",
    wallHeight: 2.4,
    bounds: { width: 8, depth: 6 },
    outline: [
      [0, 0],
      [8, 0],
      [8, 6],
      [0, 6],
    ],
    walls: [
      { id: "top", a: [0, 0], b: [8, 0], thickness: 0.2 },
      { id: "right", a: [8, 0], b: [8, 6], thickness: 0.2 },
      { id: "bottom", a: [8, 6], b: [0, 6], thickness: 0.2 },
      { id: "left", a: [0, 6], b: [0, 0], thickness: 0.2 },
      { id: "divider", a: [4, 0], b: [4, 6], thickness: 0.12 },
    ],
    rooms: [
      {
        name: "거실",
        polygon: [
          [0, 0],
          [4, 0],
          [4, 6],
          [0, 6],
        ],
      },
      {
        name: "침실",
        polygon: [
          [4, 0],
          [8, 0],
          [8, 6],
          [4, 6],
        ],
      },
    ],
    openings: [],
  },
  floorPlan: {
    fileName: "",
    size: 0,
    status: "EMPTY",
    progress: 0,
    uploadedAt: null,
  },
  furniture: [
    {
      id: "chair-e2e",
      catalogId: "chair-shell",
      name: "셸 체어",
      category: "의자",
      x: 2,
      z: 2,
      rotation: 25,
      color: "#4A665A",
    },
    {
      id: "sofa-e2e",
      catalogId: "sofa-cloud",
      name: "클라우드 소파",
      category: "소파",
      x: 2,
      z: 4.2,
      rotation: 0,
      color: "#D8C8B8",
    },
  ],
  updatedAt: "2026-10-04T00:00:00.000Z",
}

// Only the model boundary is replaced. The app uses a native module Worker,
// its real parser, proposal dialog and localStorage persistence.
type ModelResponse =
  | { text: string }
  | { hold: true }
  | { error: true }
  | { crash: true }
export async function modelWorker(
  context: BrowserContext,
  workers: ModelResponse[][]
) {
  let loads = 0
  await context.route(
    (url) => url.pathname.endsWith("/browser-ai.worker.ts"),
    async (route) => {
      const steps = workers[loads++] ?? []
      await route.fulfill({
        contentType: "text/javascript",
        body: `
        const steps = ${JSON.stringify(steps)};
        self.onmessage = ({ data }) => {
          if (typeof data.id !== "number" || !data.messages?.some(message => message.role === "user" && typeof message.content === "string")) throw new Error("Invalid model request");
          const response = steps.shift();
          if (!response) throw new Error("Unexpected model request");
          self.postMessage({ id: data.id, type: "generating" });
          if (response.hold) return;
          if (response.crash) throw new Error("Synthetic Worker failure");
          self.postMessage({ id: data.id, type: response.error ? "error" : "result", text: response.text });
        };
      `,
      })
    }
  )
  return { loads: () => loads }
}

export async function gpuSupport(
  context: BrowserContext,
  mode: "available" | "missing" | "no-adapter" | "throws" = "available"
) {
  await context.addInitScript((mode) => {
    Object.defineProperty(navigator, "gpu", {
      configurable: true,
      value:
        mode === "missing"
          ? undefined
          : {
              requestAdapter: async () => {
                if (mode === "throws")
                  throw new Error("Synthetic adapter failure")
                return mode === "no-adapter" ? null : {}
              },
            },
    })
  }, mode)
}

export async function stored(page: Page) {
  return page.evaluate((key) => localStorage.getItem(key), storageKey)
}
export async function storedProject(page: Page): Promise<Project> {
  const raw = await stored(page)
  expect(raw).not.toBeNull()
  return JSON.parse(raw!) as Project
}
export const confirmation = (page: Page) =>
  page.getByRole("dialog", { name: "배치 변경 확인", exact: true })
export const input = (page: Page) =>
  page.getByRole("textbox", { name: "가구 배치 요청", exact: true })

export async function openAssistant(page: Page, narrow: boolean) {
  await page.goto("/")
  await expect(
    page.getByRole("button", {
      name: `${initialProject.name} 프로젝트 메뉴`,
      exact: true,
    })
  ).toBeVisible()
  await page.getByRole("button", { name: "배치", exact: true }).click()
  await page
    .getByRole(narrow ? "button" : "tab", { name: "AI 배치", exact: true })
    .click()
  await page
    .getByRole("button", { name: "이 기기에서 AI 실행", exact: true })
    .click()
}
export async function send(page: Page, message: string) {
  await input(page).fill(message)
  await page.getByRole("button", { name: "요청 보내기", exact: true }).click()
}
export async function review(page: Page, description: string) {
  await expect(confirmation(page)).toBeVisible()
  await expect(confirmation(page)).toContainText(description)
  await expect(page.locator('.mobile-sheet[aria-modal="true"]')).toHaveCount(0)
}
export async function apply(page: Page) {
  await confirmation(page)
    .getByRole("button", { name: "변경 적용", exact: true })
    .click()
  await expect(confirmation(page)).toHaveCount(0)
  // On narrow screens the still-open assistant sheet hides the app bar from
  // the accessibility tree. Persistence is the shared completion criterion.
  await expect.poll(() => stored(page)).not.toBe(JSON.stringify(initialProject))
}
export async function rulesFallback(page: Page) {
  await page.getByRole("button", { name: "규칙 기반", exact: true }).click()
  await send(page, "소파를 삭제해줘")
  await review(page, "클라우드 소파 삭제")
  expect(await stored(page)).toBe(JSON.stringify(initialProject))
  await apply(page)
  expect((await storedProject(page)).furniture).toEqual([
    initialProject.furniture[0],
  ])
}

// Playwright gives every test an isolated browser context. Seed once so reload
// cannot overwrite the result being tested. Any external HTTP request fails.
export const test = base.extend<{ isolatedLocal: void }>({
  isolatedLocal: [
    async ({ context, baseURL }, use) => {
      const externalRequests: string[] = []
      await context.route("**/*", async (route) => {
        if (
          new URL(route.request().url()).origin !== new URL(baseURL!).origin
        ) {
          externalRequests.push(route.request().url())
          await route.abort("blockedbyclient")
        } else await route.fallback()
      })
      await context.addInitScript(
        ({ key, project }) => {
          if (localStorage.getItem(key) === null)
            localStorage.setItem(key, JSON.stringify(project))
        },
        { key: storageKey, project: initialProject }
      )
      await use()
      expect(
        externalRequests,
        "Local AI E2E must not download models or call external servers"
      ).toEqual([])
    },
    { auto: true },
  ],
})
