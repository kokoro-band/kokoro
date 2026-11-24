import { expect } from "@playwright/test"
import {
  test,
  initialProject,
  stored,
  storedProject,
  input,
  modelWorker,
  gpuSupport,
  openAssistant,
  send,
  review,
  apply,
} from "./helpers"

const rotate = JSON.stringify({
  action: "ROTATE",
  catalogId: "chair-shell",
  placement: null,
  rotation: 0,
  anchorCatalogId: null,
})
const baseline = JSON.stringify(initialProject)

test("rotation waits for confirmation and survives reload in storage and furniture UI", async ({
  page,
  context,
}) => {
  await gpuSupport(context)
  const model = await modelWorker(context, [[{ text: rotate }]])
  await openAssistant(page, false)
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
  await page.getByRole("button", { name: /^거실 가구 2개/ }).click()
  await page.getByRole("tab", { name: "배치한 가구 2", exact: true }).click()
  await expect(page.locator('[data-furniture-id="chair-e2e"]')).toContainText(
    "90°"
  )
})

test("Worker crash preserves storage and recovers on the next AI request", async ({
  page,
  context,
}) => {
  await gpuSupport(context)
  const model = await modelWorker(context, [
    [{ crash: true }],
    [{ text: rotate }],
  ])
  await openAssistant(page, false)
  await send(page, "의자를 90도 회전해줘")
  await expect(page.locator(".assistant-log")).toContainText(
    "브라우저 AI 작업이 중단됐어요."
  )
  expect(await stored(page)).toBe(baseline)
  await expect(input(page)).toBeEnabled()
  await send(page, "의자를 90도 회전해줘")
  await review(page, "셸 체어 회전 (90도)")
  expect(await stored(page)).toBe(baseline)
  await apply(page)
  expect((await storedProject(page)).furniture[0].rotation).toBe(90)
  expect(model.loads()).toBe(2)
})

test("stopping generation preserves storage and a fresh Worker can complete the next request", async ({
  page,
  context,
}) => {
  await gpuSupport(context)
  const model = await modelWorker(context, [
    [{ hold: true }],
    [{ text: rotate }],
  ])
  await openAssistant(page, false)
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
