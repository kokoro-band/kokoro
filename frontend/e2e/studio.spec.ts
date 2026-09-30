import { randomUUID } from "node:crypto"
import { expect, test, type Page, type Response } from "@playwright/test"
import type { Project } from "../src/features/studio/types"
import { apiURL } from "../playwright.config"

function savedResponse(page: Page, path: string, method = "PUT") {
  return page.waitForResponse(
    (response) =>
      response.url().endsWith(path) && response.request().method() === method
  )
}
async function projectResponse(response: Response) {
  expect(response.status()).toBe(200)
  return (await response.json()) as Project
}
async function createRoom(page: Page, remember: (id: string) => void) {
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
async function openFurniture(page: Page, narrow: boolean) {
  if (narrow)
    await page.getByRole("button", { name: "방 고르기", exact: true }).click()
  await page
    .getByRole("button", { name: "거실 비어 있어요", exact: true })
    .click()
  if (narrow)
    await page.getByRole("button", { name: "가구 놓기", exact: true }).click()
}
async function addFurniture(page: Page, projectId: string, name: string) {
  const response = savedResponse(page, `/projects/${projectId}/layout`)
  await page
    .getByRole("button", { name: `${name} 거실에 놓기`, exact: true })
    .click()
  return await response
}
async function summary(page: Page, saved: Project, names: string[]) {
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
  await page.getByRole("button", { name: "내역", exact: true }).click()
  await expect(page.getByRole("heading", { name: "가구 내역" })).toBeVisible()
  for (const name of names)
    await expect(page.getByRole("main")).toContainText(name)
  await expect(page.getByRole("banner")).toContainText("저장됨")
}

// Each test has a fresh browser context and explicitly owns only its created project.
const suite = test.extend<{ projectIds: string[] }>({
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

suite(
  "UI-created structure and furniture survive an actual server reload",
  async ({ page, request, projectIds }, info) => {
    const project = await createRoom(page, (id) => projectIds.push(id))
    await openFurniture(page, info.project.name === "narrow")
    const saved = await projectResponse(
      await addFurniture(page, project.id, "셸 체어")
    )
    expect(saved.revision).toBe(project.revision! + 1)
    expect(saved.furniture).toHaveLength(1)
    await summary(page, saved, ["셸 체어"])
    const read = await request.get(`${apiURL}/projects/${project.id}`)
    expect(read.ok()).toBe(true)
    const restored = (await read.json()) as Project
    expect(restored.room).toEqual(saved.room)
    expect(restored.furniture).toEqual(saved.furniture)
    expect(restored.revision).toBe(saved.revision)
  }
)

suite(
  "stale tab preserves its draft and explicitly reapplies against the latest server",
  async ({ page, context, request, projectIds }, info) => {
    const initial = await createRoom(page, (id) => projectIds.push(id))
    const other = await context.newPage()
    const initialRead = savedResponse(other, `/projects/${initial.id}`, "GET")
    await other.goto("/")
    expect((await projectResponse(await initialRead)).revision).toBe(
      initial.revision
    )
    const narrow = info.project.name === "narrow"
    await openFurniture(page, narrow)
    await openFurniture(other, narrow)
    const first = await projectResponse(
      await addFurniture(page, initial.id, "셸 체어")
    )
    const stale = await addFurniture(other, initial.id, "올리브 화분")
    expect(stale.status()).toBe(409)
    const dialog = other.getByRole("dialog", { name: "서버 내용이 바뀌었어요" })
    await expect(dialog).toBeVisible()
    const untouched = await request.get(`${apiURL}/projects/${initial.id}`)
    expect(((await untouched.json()) as Project).furniture).toEqual(
      first.furniture
    )
    await dialog
      .getByRole("button", { name: "최신 내용 확인", exact: true })
      .click()
    await expect(dialog).toContainText(`확인한 서버 버전 ${first.revision}`)
    const previewed = await request.get(`${apiURL}/projects/${initial.id}`)
    expect(((await previewed.json()) as Project).revision).toBe(first.revision)
    const reapplied = savedResponse(other, `/projects/${initial.id}/layout`)
    await dialog
      .getByRole("button", { name: "내 변경을 최신 내용에 적용", exact: true })
      .click()
    const saved = await projectResponse(await reapplied)
    expect(saved.furniture.map((item) => item.name).sort()).toEqual(
      ["셸 체어", "올리브 화분"].sort()
    )
    expect(saved.revision).toBe(first.revision! + 1)
    await expect(dialog).not.toBeVisible()
    await summary(other, saved, ["셸 체어", "올리브 화분"])
    await other.close()
  }
)
