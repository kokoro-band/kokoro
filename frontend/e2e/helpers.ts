import { randomUUID } from "node:crypto"
import { expect, test, type Page, type Response } from "@playwright/test"
import type { Project } from "../src/features/studio/types"
import { apiURL } from "../playwright.config"

export function savedResponse(page: Page, path: string, method = "PUT") {
  return page.waitForResponse(
    (response) =>
      response.url().endsWith(path) && response.request().method() === method
  )
}
export async function projectResponse(response: Response) {
  expect(response.status()).toBe(200)
  return (await response.json()) as Project
}
export async function createRoom(page: Page, remember: (id: string) => void) {
  await page.goto("/")
  await page.getByRole("button", { name: /프로젝트 메뉴$/ }).click()
  await page.getByRole("menuitem", { name: "새 프로젝트", exact: true }).click()
  await page
    .getByRole("textbox", { name: "프로젝트 이름", exact: true })
    .fill(`E2E ${randomUUID()}`)
  const created = savedResponse(page, "/projects", "POST")
  await page.getByRole("button", { name: "만들기", exact: true }).click()
  const response = await created
  expect(response.ok()).toBe(true)
  const project = (await response.json()) as Project
  remember(project.id)
  await page
    .getByRole("button", { name: "빈 집에서 그리기", exact: true })
    .click()
  const saved = savedResponse(page, `/projects/${project.id}/room`)
  await page
    .getByRole("button", { name: "이 구조로 시작", exact: true })
    .click()
  const room = await projectResponse(await saved)
  await expect(page.getByRole("banner")).toContainText("저장됨")
  return room
}
export async function openFurniture(page: Page, narrow: boolean) {
  if (narrow)
    await page.getByRole("button", { name: "방 고르기", exact: true }).click()
  await page
    .getByRole("button", { name: "거실 비어 있어요", exact: true })
    .click()
  if (narrow)
    await page.getByRole("button", { name: "가구 놓기", exact: true }).click()
}
export async function addFurniture(
  page: Page,
  projectId: string,
  name: string
) {
  const response = savedResponse(page, `/projects/${projectId}/layout`)
  await page
    .getByRole("button", { name: `${name} 거실에 놓기`, exact: true })
    .click()
  return await response
}
export async function reloadProject(page: Page, saved: Project) {
  const read = savedResponse(page, `/projects/${saved.id}`, "GET")
  await page.reload()
  const restored = await projectResponse(await read)
  expect(restored.id).toBe(saved.id)
  expect(restored.revision).toBe(saved.revision)
  expect(restored.furniture).toEqual(saved.furniture)
  expect(restored.room).toEqual(saved.room)
  await expect(
    page.getByRole("button", {
      name: `${saved.name} 프로젝트 메뉴`,
      exact: true,
    })
  ).toBeVisible()
}
export async function summary(page: Page, saved: Project, names: string[]) {
  await reloadProject(page, saved)
  await page.getByRole("button", { name: "내역", exact: true }).click()
  await expect(page.getByRole("heading", { name: "가구 내역" })).toBeVisible()
  for (const name of names)
    await expect(page.getByRole("main")).toContainText(name)
  await expect(page.getByRole("banner")).toContainText("저장됨")
}

// Each test has a fresh browser context and explicitly owns only its created project.
export const suite = test.extend<{ projectIds: string[] }>({
  projectIds: async ({ request }, runTest) => {
    const ids: string[] = []
    try {
      await runTest(ids)
    } finally {
      for (const id of ids) {
        const response = await request.delete(`${apiURL}/projects/${id}`)
        expect([204, 404]).toContain(response.status())
      }
    }
  },
})
