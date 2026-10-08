import { expect, type Page } from "@playwright/test"
import type { CommandResponse, Project } from "../src/features/studio/types"
import { apiURL } from "../playwright.config"
import {
  suite,
  createRoom,
  openFurniture,
  addFurniture,
  projectResponse,
  savedResponse,
  reloadProject,
} from "./helpers"

const dialog = (page: Page) =>
  page.getByRole("dialog", { name: "배치 변경 확인", exact: true })
async function prepare(page: Page, narrow: boolean, ids: string[]) {
  const room = await createRoom(page, (id) => ids.push(id))
  await openFurniture(page, narrow)
  const project = await projectResponse(
    await addFurniture(page, room.id, "셸 체어")
  )
  if (narrow)
    await page
      .locator(".mobile-sheet")
      .getByRole("button", { name: "닫기", exact: true })
      .click()
  await page
    .getByRole(narrow ? "button" : "tab", { name: "AI 배치", exact: true })
    .click()
  await page
    .getByRole("button", { name: "이 PC의 Ollama 사용", exact: true })
    .click()
  return project
}
async function model(page: Page, intent: unknown) {
  // Only Ollama is replaced. Catalog, intent validation, confirmation and reload use real Spring/PostgreSQL.
  await page.route("http://127.0.0.1:11434/api/chat", async (route) => {
    const body = route.request().postDataJSON()
    expect(body.model).toBe("qwen3:4b")
    expect(body.messages[0].content).toContain("chair-shell")
    expect(body.messages[0].content).not.toContain("expectedRevision")
    await route.fulfill({
      json: { message: { content: JSON.stringify(intent) } },
    })
  })
}
async function propose(page: Page, project: Project, message: string) {
  await page
    .getByRole("textbox", { name: "가구 배치 요청", exact: true })
    .fill(message)
  const pending = savedResponse(
    page,
    `/projects/${project.id}/layout/intents`,
    "POST"
  )
  await page.getByRole("button", { name: "요청 보내기", exact: true }).click()
  const response = await pending
  expect(response.status()).toBe(200)
  expect(response.request().postDataJSON().expectedRevision).toBe(
    project.revision
  )
  const proposal = (await response.json()) as CommandResponse
  expect(proposal.project.furniture).toEqual(project.furniture)
  await expect(dialog(page)).toBeVisible()
  return proposal
}

suite(
  "Ollama rotation stays a preview until confirmed and survives reload",
  async ({ page, request, projectIds }, info) => {
    const initial = await prepare(
      page,
      info.project.name === "narrow",
      projectIds
    )
    await model(page, {
      version: 1,
      intents: [{ type: "ROTATE", targetQuery: "의자", rotation: 90 }],
    })
    await propose(page, initial, "의자를 90도 회전해줘")
    await expect(dialog(page)).toContainText("90도")
    await dialog(page)
      .getByRole("button", { name: "취소", exact: true })
      .click()
    expect(
      (await (await request.get(`${apiURL}/projects/${initial.id}`)).json())
        .furniture
    ).toEqual(initial.furniture)
    const proposal = await propose(page, initial, "의자를 90도 회전해줘")
    const pending = savedResponse(
      page,
      `/projects/${initial.id}/layout/commands/confirm`,
      "POST"
    )
    await dialog(page)
      .getByRole("button", { name: "변경 적용", exact: true })
      .click()
    const response = await pending
    expect(response.status()).toBe(200)
    expect(response.request().postDataJSON()).toEqual({
      proposalId: proposal.proposalId,
    })
    const saved = ((await response.json()) as CommandResponse).project
    expect(saved.furniture[0]).toMatchObject({
      id: initial.furniture[0].id,
      x: initial.furniture[0].x,
      z: initial.furniture[0].z,
      rotation: 90,
    })
    await expect(dialog(page)).not.toBeVisible()
    await reloadProject(page, saved)
  }
)
suite(
  "Ollama confirmation response loss checks the same proposal without applying twice",
  async ({ page, request, projectIds }, info) => {
    const initial = await prepare(
      page,
      info.project.name === "narrow",
      projectIds
    )
    await model(page, {
      version: 1,
      intents: [{ type: "ROTATE", targetQuery: "의자", rotation: 90 }],
    })
    const proposal = await propose(page, initial, "의자를 90도 회전해줘")
    const path = `/projects/${initial.id}/layout/commands/confirm`
    const bodies: unknown[] = []
    await page.route(`**${path}`, async (route) => {
      if (route.request().method() !== "POST") return route.continue()
      bodies.push(route.request().postDataJSON())
      if (bodies.length !== 1) return route.continue()
      try {
        const response = await route.fetch()
        expect(response.status()).toBe(200)
      } finally {
        await route.abort("failed")
      }
    })
    try {
      await dialog(page)
        .getByRole("button", { name: "변경 적용", exact: true })
        .click()
      const retry = dialog(page).getByRole("button", {
        name: "같은 요청 다시 확인",
        exact: true,
      })
      await expect(retry).toBeVisible()
      await expect(
        dialog(page).getByRole("button", { name: "취소", exact: true })
      ).toBeDisabled()
      const committed = (await (
        await request.get(`${apiURL}/projects/${initial.id}`)
      ).json()) as Project
      expect(committed.revision).toBe(initial.revision! + 1)
      await page.clock.setFixedTime(Date.parse(proposal.expiresAt!) + 1000)
      const pending = savedResponse(page, path, "POST")
      await retry.click()
      const response = await pending
      expect(response.status()).toBe(200)
      const replay = (await response.json()) as CommandResponse
      expect(replay.project.revision).toBe(committed.revision)
      expect(replay.project.furniture).toEqual(committed.furniture)
      expect(bodies).toEqual([
        { proposalId: proposal.proposalId },
        { proposalId: proposal.proposalId },
      ])
      await expect(dialog(page)).not.toBeVisible()
      await reloadProject(page, committed)
    } finally {
      await page.unroute(`**${path}`)
    }
  }
)
suite(
  "invalid Ollama JSON never reaches the intent API and preserves the layout",
  async ({ page, request, projectIds }, info) => {
    const initial = await prepare(
      page,
      info.project.name === "narrow",
      projectIds
    )
    await model(page, { version: 1, intents: [{ type: "CLEAR", x: 1 }] })
    const intents: string[] = []
    page.on("request", (request) => {
      if (request.url().endsWith("/layout/intents")) intents.push(request.url())
    })
    await page
      .getByRole("textbox", { name: "가구 배치 요청", exact: true })
      .fill("방을 비워줘")
    await page.getByRole("button", { name: "요청 보내기", exact: true }).click()
    await expect(page.locator(".assistant-log")).toContainText(
      "이해할 수 없는 답"
    )
    expect(intents).toEqual([])
    expect(
      (await (await request.get(`${apiURL}/projects/${initial.id}`)).json())
        .furniture
    ).toEqual(initial.furniture)
    await expect(
      page.getByRole("textbox", { name: "가구 배치 요청", exact: true })
    ).toHaveValue("방을 비워줘")
  }
)
