import { expect } from "@playwright/test"
import {
  test,
  initialProject,
  stored,
  storedProject,
  confirmation,
  input,
  modelWorker,
  gpuSupport,
  openAssistant,
  send,
  review,
  apply,
  rulesFallback,
} from "./helpers"

const rotate = JSON.stringify({
  action: "ROTATE",
  catalogId: "chair-shell",
  placement: null,
  rotation: 0,
  anchorCatalogId: null,
})
const clear = JSON.stringify({
  action: "CLEAR",
  catalogId: null,
  placement: null,
  rotation: null,
  anchorCatalogId: null,
})
const baseline = JSON.stringify(initialProject)

test("rotation waits for confirmation and survives reload in storage and furniture UI", async ({
  page,
  context,
}, info) => {
  await gpuSupport(context)
  const model = await modelWorker(context, [[{ text: rotate }]])
  const narrow = info.project.name === "narrow"
  await openAssistant(page, narrow)
  await send(page, "의자를 90도 회전해줘")
  // The user's explicit angle must win over the model's wrong angle of zero.
  await review(page, "셸 체어 회전 (90도)")
  expect(await stored(page)).toBe(baseline)
  await apply(page)
  const saved = await storedProject(page)
  expect(saved.furniture).toEqual([
    { ...initialProject.furniture[0], rotation: 90 },
    initialProject.furniture[1],
  ])
  expect(saved.id).toBe(initialProject.id)
  expect(saved.room).toEqual(initialProject.room)
  expect(saved.updatedAt).not.toBe(initialProject.updatedAt)
  expect(model.loads()).toBe(1)
  await page.reload()
  expect(await storedProject(page)).toEqual(saved)
  await expect(
    page.getByRole("button", {
      name: `${initialProject.name} 프로젝트 메뉴`,
      exact: true,
    })
  ).toBeVisible()
  await page.getByRole("button", { name: "배치", exact: true }).click()
  if (narrow)
    await page.getByRole("button", { name: "방 고르기", exact: true }).click()
  await page.getByRole("button", { name: /^거실 가구 2개/ }).click()
  if (narrow)
    await page.getByRole("button", { name: "가구 놓기", exact: true }).click()
  await page.getByRole("tab", { name: "배치한 가구 2", exact: true }).click()
  await expect(page.locator('[data-furniture-id="chair-e2e"]')).toContainText(
    "90°"
  )
})

test("cancelling a clear proposal preserves storage and restores the input focus", async ({
  page,
  context,
}, info) => {
  await gpuSupport(context)
  await modelWorker(context, [[{ text: clear }]])
  await openAssistant(page, info.project.name === "narrow")
  await send(page, "방을 비워줘")
  await review(page, "가구 2개 모두 삭제")
  expect(await stored(page)).toBe(baseline)
  await confirmation(page)
    .getByRole("button", { name: "취소", exact: true })
    .click()
  await expect(confirmation(page)).toHaveCount(0)
  await expect(input(page)).toBeFocused()
  expect(await stored(page)).toBe(baseline)
  await page.reload()
  await page.getByRole("button", { name: "내역", exact: true }).click()
  await expect(page.getByRole("main")).toContainText("셸 체어")
  await expect(page.getByRole("main")).toContainText("클라우드 소파")
  expect(await stored(page)).toBe(baseline)
})

test("explicit plant beside sofa corrects a wrong model target and stays in the living room", async ({
  page,
  context,
}, info) => {
  await gpuSupport(context)
  await modelWorker(context, [
    [
      {
        text: JSON.stringify({
          action: "ADD",
          catalogId: "sofa-cloud",
          placement: "CENTER",
          rotation: null,
          anchorCatalogId: null,
        }),
      },
    ],
  ])
  await openAssistant(page, info.project.name === "narrow")
  await send(page, "소파 옆에 화분을 놓아줘")
  await review(page, "올리브 화분 추가")
  expect(await stored(page)).toBe(baseline)
  await apply(page)
  const saved = await storedProject(page)
  expect(saved.furniture.slice(0, 2)).toEqual(initialProject.furniture)
  expect(saved.furniture).toHaveLength(3)
  const plant = saved.furniture[2]
  expect(plant.catalogId).toBe("plant-olive")
  expect(plant.x).toBeGreaterThan(0)
  expect(plant.x).toBeLessThan(4)
  expect(plant.z).toBeGreaterThan(0)
  expect(plant.z).toBeLessThan(6)
  expect(Math.hypot(plant.x - 2, plant.z - 4.2)).toBeLessThanOrEqual(2.2)
  await page.reload()
  await page.getByRole("button", { name: "내역", exact: true }).click()
  await expect(page.getByRole("main")).toContainText("올리브 화분")
  expect(await storedProject(page)).toEqual(saved)
})

for (const [name, text, message] of [
  [
    "malformed JSON",
    "not JSON",
    "AI가 요청을 읽을 수 있는 형식으로 답하지 않았어요.",
  ],
  [
    "unknown action",
    '{"action":"FLY","catalogId":"chair-shell"}',
    "AI 응답 형식이 올바르지 않아요.",
  ],
  [
    "unknown catalog item",
    '{"action":"ADD","catalogId":"imaginary-chair"}',
    "AI가 카탈로그에 없는 가구를 골랐어요. 배치는 유지했어요.",
  ],
]) {
  test(`${name} preserves the project and permits a rule based request`, async ({
    page,
    context,
  }, info) => {
    await gpuSupport(context)
    await modelWorker(context, [[{ text }]])
    await openAssistant(page, info.project.name === "narrow")
    await send(page, "의자를 90도 회전해줘")
    await expect(page.locator(".assistant-log")).toContainText(message)
    await expect(confirmation(page)).toHaveCount(0)
    await expect(input(page)).toBeEnabled()
    expect(await stored(page)).toBe(baseline)
    await rulesFallback(page)
  })
}

for (const mode of ["missing", "no-adapter", "throws"] as const) {
  test(`WebGPU ${mode} never starts a model and permits a rule based request`, async ({
    page,
    context,
  }, info) => {
    await gpuSupport(context, mode)
    const model = await modelWorker(context, [])
    await openAssistant(page, info.project.name === "narrow")
    await send(page, "의자를 90도 회전해줘")
    await expect(page.locator(".assistant-log")).toContainText(
      "이 브라우저에서는 WebGPU를 사용할 수 없어요."
    )
    expect(model.loads()).toBe(0)
    expect(await stored(page)).toBe(baseline)
    await rulesFallback(page)
    expect(model.loads()).toBe(0)
  })
}

for (const failure of ["error", "crash"] as const) {
  test(`Worker ${failure} preserves storage and recovers on the next AI request`, async ({
    page,
    context,
  }, info) => {
    await gpuSupport(context)
    const fail =
      failure === "error" ? { error: true as const } : { crash: true as const }
    const model = await modelWorker(
      context,
      failure === "error"
        ? [[fail, { text: rotate }]]
        : [[fail], [{ text: rotate }]]
    )
    await openAssistant(page, info.project.name === "narrow")
    await send(page, "의자를 90도 회전해줘")
    await expect(page.locator(".assistant-log")).toContainText(
      failure === "error"
        ? "브라우저 AI를 실행하지 못했어요."
        : "브라우저 AI 작업이 중단됐어요."
    )
    expect(await stored(page)).toBe(baseline)
    await expect(input(page)).toBeEnabled()
    await send(page, "의자를 90도 회전해줘")
    await review(page, "셸 체어 회전 (90도)")
    expect(await stored(page)).toBe(baseline)
    await apply(page)
    expect((await storedProject(page)).furniture[0].rotation).toBe(90)
    expect(model.loads()).toBe(failure === "error" ? 1 : 2)
  })
}

test("stopping generation preserves storage and a fresh Worker can complete the next request", async ({
  page,
  context,
}, info) => {
  await gpuSupport(context)
  const model = await modelWorker(context, [
    [{ hold: true }],
    [{ text: rotate }],
  ])
  await openAssistant(page, info.project.name === "narrow")
  await send(page, "의자를 90도 회전해줘")
  await expect(page.locator(".assistant-log")).toContainText(
    "이 기기에서 배치 요청을 해석하고 있어요."
  )
  await expect(
    page.getByRole("button", { name: "요청 보내기", exact: true })
  ).toBeDisabled()
  await page
    .getByRole("button", { name: "모델 요청 중단", exact: true })
    .click()
  await expect(page.locator(".assistant-log")).toContainText(
    "브라우저 AI 요청을 중단했어요. 배치는 유지했어요."
  )
  await expect(input(page)).toBeEnabled()
  await expect(
    page.getByRole("button", { name: "모델 요청 중단", exact: true })
  ).toHaveCount(0)
  expect(await stored(page)).toBe(baseline)
  await send(page, "의자를 90도 회전해줘")
  await review(page, "셸 체어 회전 (90도)")
  expect(await stored(page)).toBe(baseline)
  await apply(page)
  expect((await storedProject(page)).furniture[0].rotation).toBe(90)
  expect(model.loads()).toBe(2)
})
