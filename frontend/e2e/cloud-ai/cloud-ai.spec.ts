import { expect, test as base } from "@playwright/test"
import process from "node:process"
import {
  initialProject,
  storageKey,
  stored,
  storedProject,
  send,
  review,
  apply,
  confirmation,
  input,
} from "../local-ai/helpers"

const provider = process.env.KOKORO_E2E_PROVIDER!
const api = process.env.KOKORO_E2E_API!
const baseline = JSON.stringify(initialProject)
const test = base.extend<{ isolatedCloud: void }>({
  isolatedCloud: [
    async ({ context, baseURL }, use) => {
      const unexpected: string[] = []
      const allowed = [new URL(baseURL!).origin, new URL(api).origin]
      await context.route("**/*", async (route) => {
        if (!allowed.includes(new URL(route.request().url()).origin)) {
          unexpected.push(route.request().url())
          await route.abort("blockedbyclient")
        } else await route.continue()
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
        unexpected,
        "Browser must not contact model providers or download models"
      ).toEqual([])
    },
    { auto: true },
  ],
})

test.beforeEach(async ({ page }, info) => {
  await page.goto("/")
  await page.getByRole("button", { name: "배치", exact: true }).click()
  await page
    .getByRole(info.project.name === "narrow" ? "button" : "tab", {
      name: "AI 배치",
      exact: true,
    })
    .click()
  await page
    .getByRole("button", { name: "외부 AI로 해석", exact: true })
    .click()
  await expect(
    page.getByText("요청 문장과 현재 가구 이름을 외부 AI 서비스에 보냅니다.", {
      exact: false,
    })
  ).toBeVisible()
})

test("real Spring conversion uses schema and preview; apply survives reload", async ({
  page,
  request,
}) => {
  await send(page, "의자를 90도 회전해줘")
  await review(page, "셸 체어 회전 (90도)")
  expect(await stored(page)).toBe(baseline)
  const calls = await request
    .get(provider + "/calls")
    .then((response) => response.json())
  const call = calls.at(-1)
  expect(call.message).toBe("의자를 90도 회전해줘")
  expect(call.schema.required).toContain("anchorCatalogId")
  expect(call.key).toBe("e2e-test-key-only")
  expect(Object.keys(call.context).sort()).toEqual([
    "catalog",
    "furniture",
    "message",
  ])
  await apply(page)
  const saved = await storedProject(page)
  expect(saved.furniture).toEqual([
    { ...initialProject.furniture[0], rotation: 90 },
    initialProject.furniture[1],
  ])
  await page.reload()
  expect(await storedProject(page)).toEqual(saved)
})

test("relative placement remains near its anchor in the same room", async ({
  page,
}) => {
  await send(page, "소파 옆에 화분 하나 놔줘")
  await review(page, "올리브 화분 추가")
  expect(await stored(page)).toBe(baseline)
  await apply(page)
  const saved = await storedProject(page)
  const added = saved.furniture.find(
    (item) => item.catalogId === "plant-olive"
  )!
  expect(added).toBeDefined()
  expect(added.x).toBeLessThan(4)
  expect(
    Math.hypot(
      added.x - initialProject.furniture[1].x,
      added.z - initialProject.furniture[1].z
    )
  ).toBeLessThan(2.5)
})

test("cancel preserves the entire saved project and restores focus", async ({
  page,
}) => {
  await send(page, "방을 비워줘")
  await review(page, "가구 2개 모두 삭제")
  await confirmation(page)
    .getByRole("button", { name: "취소", exact: true })
    .click()
  await expect(input(page)).toBeFocused()
  expect(await stored(page)).toBe(baseline)
  await page.reload()
  expect(await stored(page)).toBe(baseline)
})

test("choosing a duplicate target reuses the intent without another provider call", async ({
  page,
  request,
}, info) => {
  const project = structuredClone(initialProject)
  project.furniture.push({
    ...project.furniture[0],
    id: "chair-second",
    x: 6,
    z: 2,
  })
  const duplicateBaseline = JSON.stringify(project)
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), {
    key: storageKey,
    raw: duplicateBaseline,
  })
  await page.reload()
  await page.getByRole("button", { name: "배치", exact: true }).click()
  await page
    .getByRole(info.project.name === "narrow" ? "button" : "tab", {
      name: "AI 배치",
      exact: true,
    })
    .click()
  await page
    .getByRole("button", { name: "외부 AI로 해석", exact: true })
    .click()
  const count = (
    await request.get(provider + "/calls").then((response) => response.json())
  ).length
  await send(page, "의자를 직각으로 돌려줘")
  const choose = page.getByRole("dialog", {
    name: "대상 가구 선택",
    exact: true,
  })
  await expect(choose).toBeVisible()
  expect(await stored(page)).toBe(duplicateBaseline)
  await choose.getByRole("button", { name: /2\. 셸 체어/ }).click()
  await review(page, "셸 체어 회전 (90도)")
  expect(await stored(page)).toBe(duplicateBaseline)
  await apply(page)
  const saved = await storedProject(page)
  expect(saved.furniture).toEqual([
    project.furniture[0],
    project.furniture[1],
    { ...project.furniture[2], rotation: 90 },
  ])
  expect(
    (await request.get(provider + "/calls").then((response) => response.json()))
      .length - count
  ).toBe(1)
})

for (const [message, error] of [
  ["호출 한도 테스트", "요청이 많아요"],
  ["잘못된 응답 테스트", "외부 AI가 올바른 배치 의도를 반환하지 않았어요"],
  ["응답 지연 테스트", "외부 AI 응답이 늦어 중단했어요"],
]) {
  test(`${message} preserves layout and allows a new request`, async ({
    page,
  }) => {
    await send(page, message)
    await expect(page.locator(".assistant-log")).toContainText(error)
    await expect(input(page)).toHaveValue(message)
    expect(await stored(page)).toBe(baseline)
    await expect(confirmation(page)).toHaveCount(0)
    await send(page, "의자를 90도 회전해줘")
    await review(page, "셸 체어 회전 (90도)")
    expect(await stored(page)).toBe(baseline)
  })
}

test("stop ignores the late provider response and allows another request", async ({
  page,
  request,
}) => {
  await send(page, "요청 중단 테스트")
  await expect
    .poll(async () => {
      const calls = await request
        .get(provider + "/calls")
        .then((response) => response.json())
      return calls.at(-1)?.message
    })
    .toBe("요청 중단 테스트")
  await page
    .getByRole("button", { name: "모델 요청 중단", exact: true })
    .click()
  await expect(page.locator(".assistant-log")).toContainText(
    "외부 AI 요청을 중단했어요"
  )
  await expect
    .poll(async () => {
      const calls = await request
        .get(provider + "/calls")
        .then((response) => response.json())
      return calls.at(-1)?.completed
    })
    .toBe(true)
  await expect(confirmation(page)).toHaveCount(0)
  expect(await stored(page)).toBe(baseline)
  await send(page, "의자를 90도 회전해줘")
  await review(page, "셸 체어 회전 (90도)")
})
