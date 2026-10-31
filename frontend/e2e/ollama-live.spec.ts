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

// Real qwen3:4b on this PC. Nothing is mocked: model, Spring and PostgreSQL all run.
const dialog = (page: Page) =>
  page.getByRole("dialog", { name: "배치 변경 확인", exact: true })

async function prepare(page: Page, ids: string[]) {
  const room = await createRoom(page, (id) => ids.push(id))
  await openFurniture(page, false)
  const project = await projectResponse(
    await addFurniture(page, room.id, "셸 체어")
  )
  await page.getByRole("tab", { name: "AI 배치", exact: true }).click()
  await page
    .getByRole("button", { name: "이 PC의 Ollama 사용", exact: true })
    .click()
  return project
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
  if (response.status() !== 200)
    console.log(
      "INTENT",
      JSON.stringify(response.request().postDataJSON()),
      await response.text()
    )
  expect(response.status()).toBe(200)
  const proposal = (await response.json()) as CommandResponse
  expect(proposal.project.furniture).toEqual(project.furniture)
  await expect(dialog(page)).toBeVisible()
  return proposal
}

async function apply(page: Page, proposal: CommandResponse) {
  const pending = savedResponse(
    page,
    `/projects/${proposal.project.id}/layout/commands/confirm`,
    "POST"
  )
  await dialog(page)
    .getByRole("button", { name: "변경 적용", exact: true })
    .click()
  const response = await pending
  expect(response.status()).toBe(200)
  const saved = ((await response.json()) as CommandResponse).project
  await expect(dialog(page)).not.toBeVisible()
  return saved
}

suite.describe.configure({ timeout: 180_000 })

suite(
  "real model rotation: cancel keeps layout, apply persists after reload",
  async ({ page, request, projectIds }, info) => {
    suite.skip(info.project.name !== "desktop")
    const initial = await prepare(page, projectIds)
    await propose(page, initial, "의자를 90도 회전해줘")
    await dialog(page)
      .getByRole("button", { name: "취소", exact: true })
      .click()
    expect(
      (await (await request.get(`${apiURL}/projects/${initial.id}`)).json())
        .furniture
    ).toEqual(initial.furniture)

    const proposal = await propose(page, initial, "의자를 90도 회전해줘")
    const saved = await apply(page, proposal)
    expect(saved.furniture[0]).toMatchObject({
      id: initial.furniture[0].id,
      rotation: 90,
    })
    await reloadProject(page, saved)
  }
)

suite(
  "real model add into an empty room persists after reload",
  async ({ page, projectIds }, info) => {
    suite.skip(info.project.name !== "desktop")
    const initial = await prepare(page, projectIds)
    // The server ADD uses a fixed default spot, so clear the chair there first.
    const empty = await apply(
      page,
      await propose(page, initial, "의자를 치워줘")
    )
    expect(empty.furniture).toHaveLength(0)
    const proposal = await propose(page, empty, "모스 소파를 하나 놓아줘")
    const saved = await apply(page, proposal)
    expect(saved.furniture.map((item) => item.catalogId)).toEqual(["sofa-moss"])
    await reloadProject(page, saved)
  }
)

suite(
  "real model remove: furniture is gone after confirm and reload",
  async ({ page, projectIds }, info) => {
    suite.skip(info.project.name !== "desktop")
    const initial = await prepare(page, projectIds)
    const proposal = await propose(page, initial, "의자를 치워줘")
    const saved = await apply(page, proposal)
    expect(saved.furniture).toHaveLength(0)
    await reloadProject(page, saved)
  }
)
