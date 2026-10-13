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
const candidateDialog = (page: Page) =>
  page.getByRole("dialog", { name: "대상 가구 선택", exact: true })
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
  await expect(
    proposal.candidates.length > 0 && !proposal.requiresConfirmation
      ? candidateDialog(page)
      : dialog(page)
  ).toBeVisible()
  return proposal
}

// Verifies the current pending-ADD behavior through real intent, confirmation and persistence APIs.
suite(
  "Ollama rotates a selected pending ADD chair only after confirmation and persists it",
  async ({ page, request, projectIds }, info) => {
    const initial = await prepare(
      page,
      info.project.name === "narrow",
      projectIds
    )
    expect(initial.furniture).toHaveLength(1)
    const intent = {
      version: 1,
      intents: [
        { type: "ADD", catalogId: "chair-shell", count: 2 },
        { type: "ROTATE", targetQuery: "의자", rotation: 90 },
      ],
    }
    await model(page, intent)
    const proposal = await propose(
      page,
      initial,
      "셸 체어 2개를 추가하고 의자를 90도 회전해줘"
    )
    expect(proposal.requiresConfirmation).toBe(false)
    expect(proposal.project).toEqual(initial)
    expect(proposal.candidates).toHaveLength(3)
    expect(
      proposal.candidates.map((candidate) => candidate.furnitureId)
    ).toContain(initial.furniture[0].id)
    const pendingCandidates = proposal.candidates.filter(
      (candidate) =>
        !initial.furniture.some((item) => item.id === candidate.furnitureId)
    )
    expect(pendingCandidates).toHaveLength(2)
    const selected = pendingCandidates[1]
    const candidateIndex = proposal.candidates.indexOf(selected)
    const choice = candidateDialog(page).getByRole("button", {
      name: `${candidateIndex + 1}. ${selected.name} (추가 예정)`,
      exact: true,
    })
    await expect(choice).toBeEnabled()
    const readBase = async () => {
      const response = await request.get(`${apiURL}/projects/${initial.id}`)
      expect(response.status()).toBe(200)
      return (await response.json()) as Project
    }
    expect(await readBase()).toEqual(initial)

    const selecting = savedResponse(
      page,
      `/projects/${initial.id}/layout/intents`,
      "POST"
    )
    await choice.click()
    const selectionResponse = await selecting
    expect(selectionResponse.status()).toBe(200)
    expect(selectionResponse.request().postDataJSON()).toEqual({
      expectedRevision: initial.revision,
      intent,
      selections: { "1": selected.furnitureId },
    })
    const confirmation = (await selectionResponse.json()) as CommandResponse
    expect(confirmation.requiresConfirmation).toBe(true)
    expect(confirmation.project).toEqual(initial)
    expect(confirmation.proposedCommands).toEqual([
      expect.objectContaining({ type: "ADD", catalogId: "chair-shell" }),
      expect.objectContaining({ type: "ADD", catalogId: "chair-shell" }),
      expect.objectContaining({
        type: "ROTATE",
        furnitureId: selected.furnitureId,
        rotation: 90,
      }),
    ])
    await expect(dialog(page)).toBeVisible()
    await expect(dialog(page)).toContainText("90도")
    expect(await readBase()).toEqual(initial)

    const applying = savedResponse(
      page,
      `/projects/${initial.id}/layout/commands/confirm`,
      "POST"
    )
    await dialog(page)
      .getByRole("button", { name: "변경 적용", exact: true })
      .click()
    const response = await applying
    expect(response.status()).toBe(200)
    expect(response.request().postDataJSON()).toEqual({
      proposalId: confirmation.proposalId,
    })
    const saved = ((await response.json()) as CommandResponse).project
    expect(saved.revision).toBe(initial.revision! + 1)
    expect(saved.furniture).toHaveLength(3)
    expect(saved.furniture.map((item) => item.catalogId)).toEqual([
      "chair-shell",
      "chair-shell",
      "chair-shell",
    ])
    expect(
      saved.furniture.find((item) => item.id === initial.furniture[0].id)
    ).toEqual(initial.furniture[0])
    expect(
      saved.furniture.find((item) => item.id === selected.furnitureId)
    ).toMatchObject({ catalogId: "chair-shell", rotation: 90 })
    expect(
      saved.furniture.find(
        (item) => item.id === pendingCandidates[0].furnitureId
      )
    ).toMatchObject({ rotation: 0 })
    expect(saved.furniture.map((item) => item.id).sort()).toEqual(
      proposal.candidates.map((candidate) => candidate.furnitureId).sort()
    )
    await expect(dialog(page)).not.toBeVisible()
    await reloadProject(page, saved)
  }
)

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
