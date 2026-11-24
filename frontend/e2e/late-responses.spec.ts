import { Buffer } from "node:buffer"
import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import { expect, type APIRequestContext, type Page } from "@playwright/test"
import type { Project } from "../src/features/studio/types"
import { apiURL } from "../playwright.config"
import {
  suite,
  expectPersistedProject,
  createRoom,
  openFurniture,
  addFurniture,
  savedResponse,
  projectResponse,
  reloadProject,
} from "./helpers"

function gate() {
  let release!: () => void
  const opened = new Promise<void>((resolve) => {
    release = resolve
  })
  return { opened, release }
}

// Fetch once from Spring, then hold its unmodified response until the user has
// switched projects. No successful API response or processing state is mocked.
async function holdResponse(page: Page, path: string, method: string) {
  const held = gate()
  const fetched = gate()
  let status!: number
  let body!: unknown
  let count = 0
  await page.route(`**${path}`, async (route) => {
    if (route.request().method() !== method) return route.continue()
    count++
    const response = await route.fetch({ maxRetries: 0 })
    status = response.status()
    body = await response.json()
    fetched.release()
    await held.opened
    await route.fulfill({ response })
  })
  return {
    release: held.release,
    async fetched() {
      await fetched.opened
      return { status, body }
    },
    count: () => count,
  }
}

async function field(page: Page, name: string, value: string) {
  const input = page.getByRole("textbox", { name, exact: true })
  await input.fill(value)
  await input.press("Enter")
}

async function closeSheet(page: Page, narrow: boolean) {
  if (!narrow) return
  await page
    .locator(".mobile-sheet")
    .getByRole("button", { name: "닫기", exact: true })
    .click()
  await expect(page.locator(".mobile-sheet")).toHaveCount(0)
}

async function read(request: APIRequestContext, id: string) {
  const response = await request.get(`${apiURL}/projects/${id}`)
  expect(response.status()).toBe(200)
  return (await response.json()) as Project
}

async function createNext(page: Page, ids: string[]) {
  await page.getByRole("button", { name: /프로젝트 메뉴$/ }).click()
  await page.getByRole("menuitem", { name: "새 프로젝트", exact: true }).click()
  await page
    .getByRole("textbox", { name: "프로젝트 이름", exact: true })
    .fill(`E2E next ${randomUUID()}`)
  const created = savedResponse(page, "/projects", "POST")
  // The previous project's in-flight operation requires a leave confirmation.
  const leaving = page.waitForEvent("dialog")
  const creating = page
    .getByRole("button", { name: "만들기", exact: true })
    .click()
  const dialog = await leaving
  expect(dialog.type()).toBe("confirm")
  await dialog.accept()
  await creating
  const response = await created
  expect(response.status()).toBe(201)
  const project = (await response.json()) as Project
  ids.push(project.id)
  await page
    .getByRole("button", { name: "빈 집에서 그리기", exact: true })
    .click()
  const saved = savedResponse(page, `/projects/${project.id}/room`)
  await page
    .getByRole("button", { name: "이 구조로 시작", exact: true })
    .click()
  return projectResponse(await saved)
}

async function exportProject(page: Page) {
  await page.getByRole("button", { name: /프로젝트 메뉴$/ }).click()
  const downloading = page.waitForEvent("download")
  await page
    .getByRole("menuitem", { name: "JSON으로 내보내기", exact: true })
    .click()
  const download = await downloading
  return JSON.parse(await readFile((await download.path())!, "utf8")) as Project
}

async function upload(page: Page, invalid: boolean) {
  await page.getByRole("button", { name: /프로젝트 메뉴$/ }).click()
  await page.getByRole("menuitem", { name: "도면 파일", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "도면 파일", exact: true })
  const choosing = page.waitForEvent("filechooser")
  await dialog
    .getByRole("button", { name: "도면 파일 올리기", exact: true })
    .click()
  await (
    await choosing
  ).setFiles({
    name: "previous-project.png",
    mimeType: "image/png",
    buffer: invalid
      ? Buffer.from("This is not a PNG. Spring must reject its contents.")
      : Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
          "base64"
        ),
  })
  await expect(dialog).toContainText("previous-project.png")
  await dialog.getByRole("button", { name: "닫기", exact: true }).click()
}

// These characterize existing navigation guards. Only delivery timing changes;
// they do not claim a new feature's RED/GREEN development cycle.
for (const operation of [
  "layout",
  "upload",
  "status",
  "rejected upload",
] as const) {
  suite(
    `a late ${operation} response cannot replace the next project's revision or draft`,
    async ({ page, request, projectIds }, info) => {
      const narrow = info.project.name === "narrow"
      const room = await createRoom(page, (id) => projectIds.push(id))
      await openFurniture(page, narrow)
      const previous = await projectResponse(
        await addFurniture(page, room.id, "셸 체어")
      )
      const method =
        operation === "layout" ? "PUT" : operation === "status" ? "GET" : "POST"
      const path = `/projects/${previous.id}${operation === "layout" ? "/layout" : operation === "status" ? "" : "/floor-plan"}`
      const held = await holdResponse(page, path, method)
      try {
        if (operation === "layout") {
          await field(page, "가로", "2")
          await closeSheet(page, narrow)
        } else {
          await closeSheet(page, narrow)
          await upload(page, operation === "rejected upload")
        }
        const oldResponse = await held.fetched()
        expect(oldResponse.status).toBe(
          operation === "rejected upload" ? 415 : 200
        )
        if (operation !== "rejected upload") {
          expect(oldResponse.body).toMatchObject({ id: previous.id })
          expect((oldResponse.body as Project).revision).toBeGreaterThan(
            previous.revision!
          )
        }
        // The real write already committed even though its response is withheld.
        const storedPrevious = await read(request, previous.id)
        expect(storedPrevious.furniture[0]).toMatchObject({
          id: previous.furniture[0].id,
          x: operation === "layout" ? 2 : previous.furniture[0].x,
        })
        if (operation === "status")
          expect((oldResponse.body as Project).floorPlan.status).toBe("READY")

        const nextRoom = await createNext(page, projectIds)
        await openFurniture(page, narrow)
        const next = await projectResponse(
          await addFurniture(page, nextRoom.id, "올리브 화분")
        )
        await closeSheet(page, narrow)
        await page.getByRole("button", { name: "구조", exact: true }).click()
        await field(page, "이름", "새 프로젝트의 미저장 구조")
        await expect(
          page.getByRole("button", { name: "구조 저장", exact: true })
        ).toBeEnabled()
        const before = await exportProject(page)
        expect(before).toMatchObject({
          id: next.id,
          revision: next.revision,
          room: next.room,
          furniture: next.furniture,
          floorPlan: next.floorPlan,
        })

        const delivered = savedResponse(page, path, method)
        held.release()
        expect(await (await delivered).finished()).toBeNull()
        expect(await exportProject(page)).toEqual(before)
        await expect(
          page.getByRole("button", {
            name: `${next.name} 프로젝트 메뉴`,
            exact: true,
          })
        ).toBeVisible()
        await expect(
          page.getByRole("textbox", { name: "이름", exact: true })
        ).toHaveValue("새 프로젝트의 미저장 구조")
        expect(
          await page.evaluate(() =>
            localStorage.getItem("kokoro-active-server-project-v1")
          )
        ).toBe(next.id)
        await page.getByRole("button", { name: /프로젝트 메뉴$/ }).click()
        await page
          .getByRole("menuitem", { name: "도면 파일", exact: true })
          .click()
        const plan = page.getByRole("dialog", {
          name: "도면 파일",
          exact: true,
        })
        await expect(plan).toContainText("아직 올린 도면이 없어요")
        await expect(
          plan.getByRole("button", { name: "도면 파일 올리기", exact: true })
        ).toBeEnabled()
        await plan.getByRole("button", { name: "닫기", exact: true }).click()

        const saving = savedResponse(page, `/projects/${next.id}/room`)
        await page
          .getByRole("button", { name: "구조 저장", exact: true })
          .click()
        const response = await saving
        expect(response.request().postDataJSON().expectedRevision).toBe(
          next.revision
        )
        const saved = await projectResponse(response)
        expect(saved.revision).toBe(next.revision! + 1)
        expect(saved.room!.rooms[0].name).toBe("새 프로젝트의 미저장 구조")
        expect(saved.furniture).toEqual(next.furniture)
        expect(saved.floorPlan).toEqual(next.floorPlan)
        expectPersistedProject(await read(request, next.id), saved)
        await reloadProject(page, saved)
        expect(held.count()).toBe(1)
        const after = await read(request, previous.id)
        expect(after.room).toEqual(previous.room)
        expect(after.furniture).toEqual(storedPrevious.furniture)
        if (operation === "layout" || operation === "rejected upload")
          expect(after.revision).toBe(storedPrevious.revision)
      } finally {
        held.release()
        await page.unrouteAll({ behavior: "wait" })
      }
    }
  )
}
