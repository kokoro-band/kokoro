import { Buffer } from "node:buffer"
import { readFile } from "node:fs/promises"
import { expect, type APIRequestContext, type Page } from "@playwright/test"
import type { Project } from "../src/features/studio/types"
import { apiURL } from "../playwright.config"
import {
  addFurniture,
  createRoom,
  openFurniture,
  projectResponse,
} from "./helpers"

export function gate() {
  let release!: () => void
  const opened = new Promise<void>((resolve) => {
    release = resolve
  })
  return { opened, release }
}
export async function field(page: Page, name: string, value: string) {
  const input = page.getByRole("textbox", { name, exact: true })
  await input.fill(value)
  await input.press("Enter")
}
export async function closeSheet(page: Page, narrow: boolean) {
  if (!narrow) return
  await page
    .locator(".mobile-sheet")
    .getByRole("button", { name: "닫기", exact: true })
    .click()
  await expect(page.locator(".mobile-sheet")).toHaveCount(0)
}
export async function read(request: APIRequestContext, id: string) {
  const response = await request.get(apiURL + "/projects/" + id)
  expect(response.status()).toBe(200)
  return (await response.json()) as Project
}
export async function prepare(page: Page, narrow: boolean, ids: string[]) {
  const room = await createRoom(page, (id) => ids.push(id))
  await openFurniture(page, narrow)
  const saved = await projectResponse(
    await addFurniture(page, room.id, "셸 체어")
  )
  await closeSheet(page, narrow)
  await page.getByRole("button", { name: "구조", exact: true }).click()
  await field(page, "이름", "내 미저장 거실")
  return saved
}
export const planDialog = (page: Page) =>
  page.getByRole("dialog", { name: "도면 파일", exact: true })
export async function openPlan(page: Page) {
  await page.getByRole("button", { name: /프로젝트 메뉴$/ }).click()
  await page.getByRole("menuitem", { name: "도면 파일", exact: true }).click()
  await expect(planDialog(page)).toBeVisible()
  return planDialog(page)
}
export type FileInput = { name: string; mimeType: string; buffer: Buffer }
export async function choose(
  page: Page,
  button: ReturnType<Page["getByRole"]>,
  file?: FileInput
) {
  const choosing = page.waitForEvent("filechooser")
  await button.click()
  const chooser = await choosing
  await chooser.setFiles(file ? [file] : [])
}
export async function upload(page: Page, file?: FileInput) {
  const dialog = planDialog(page)
  await choose(
    page,
    dialog.getByRole("button", {
      name: /^(도면 파일 올리기|다른 파일 올리기)$/,
    }),
    file
  )
}
export async function ready(page: Page, name: string) {
  await expect(planDialog(page)).toContainText(name)
  await expect(planDialog(page)).toContainText("파일 처리 완료")
  await expect(
    planDialog(page).getByRole("button", {
      name: "다른 파일 올리기",
      exact: true,
    })
  ).toBeEnabled()
}
export async function exportProject(page: Page) {
  await page.getByRole("button", { name: /프로젝트 메뉴$/ }).click()
  const downloading = page.waitForEvent("download")
  await page
    .getByRole("menuitem", { name: "JSON으로 내보내기", exact: true })
    .click()
  return JSON.parse(
    await readFile((await (await downloading).path())!, "utf8")
  ) as Project
}
export async function preserved(
  page: Page,
  request: APIRequestContext,
  initial: Project
) {
  await planDialog(page)
    .getByRole("button", { name: "닫기", exact: true })
    .click()
  await expect(
    page.getByRole("textbox", { name: "이름", exact: true })
  ).toHaveValue("내 미저장 거실")
  const exported = await exportProject(page)
  expect(exported.id).toBe(initial.id)
  expect(exported.room).toEqual(initial.room)
  expect(exported.furniture).toEqual(initial.furniture)
  const stored = await read(request, initial.id)
  expect(stored.room).toEqual(initial.room)
  expect(stored.furniture).toEqual(initial.furniture)
  return { exported, stored }
}
export function recordUploads(page: Page, id: string) {
  const requests: string[] = []
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      request.url().endsWith("/projects/" + id + "/floor-plan")
    )
      requests.push(request.postData() ?? "")
  })
  return requests
}
export function pdf(name = "original.pdf"): FileInput {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Contents 4 0 R >>",
    "<< /Length 0 >>\nstream\n\nendstream",
  ]
  let body = "%PDF-1.4\n"
  const offsets = [0]
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(body))
    body += index + 1 + " 0 obj\n" + object + "\nendobj\n"
  }
  const xref = Buffer.byteLength(body)
  body += "xref\n0 5\n0000000000 65535 f \n"
  body += offsets
    .slice(1)
    .map((offset) => String(offset).padStart(10, "0") + " 00000 n \n")
    .join("")
  body += "trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF\n"
  return { name, mimeType: "application/pdf", buffer: Buffer.from(body) }
}
// Draw only a file fixture. Decoding, validation and room analysis in the app
// remain real; no app state, image decoder or canvas API is replaced.
export async function png(page: Page, blank = false): Promise<FileInput> {
  const base64 = await page.evaluate((empty) => {
    const canvas = document.createElement("canvas")
    canvas.width = canvas.height = 800
    const context = canvas.getContext("2d")!
    context.fillStyle = "#fff"
    context.fillRect(0, 0, 800, 800)
    if (!empty) {
      for (const x of [60, 392]) {
        context.fillStyle = "#000"
        context.fillRect(x - 6, 74, 332, 612)
        context.fillStyle = "#fff"
        context.fillRect(x, 80, 320, 600)
      }
    }
    return canvas.toDataURL("image/png").split(",")[1]
  }, blank)
  return {
    name: blank ? "blank.png" : "two-rooms.png",
    mimeType: "image/png",
    buffer: Buffer.from(base64, "base64"),
  }
}
