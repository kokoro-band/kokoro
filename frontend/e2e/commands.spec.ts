import { expect, type Page } from "@playwright/test"
import type { CommandResponse } from "../src/features/studio/types"
import {
  suite,
  createRoom,
  openFurniture,
  addFurniture,
  savedResponse,
  projectResponse,
  reloadProject,
} from "./helpers"

const confirmation = (page: Page) =>
  page.getByRole("dialog", { name: "배치 변경 확인", exact: true })

suite(
  "clear command waits for confirmation, persists on confirm, and survives reload",
  async ({ page, projectIds }) => {
    const room = await createRoom(page, (id) => projectIds.push(id))
    await openFurniture(page, false)
    const initial = await projectResponse(
      await addFurniture(page, room.id, "셸 체어")
    )
    await page.getByRole("tab", { name: "AI 배치", exact: true }).click()
    await page
      .getByRole("textbox", { name: "가구 배치 요청", exact: true })
      .fill("방을 비워줘")
    const proposing = savedResponse(
      page,
      `/projects/${initial.id}/layout/commands`,
      "POST"
    )
    await page.getByRole("button", { name: "요청 보내기", exact: true }).click()
    const proposal = (await (await proposing).json()) as CommandResponse
    expect(proposal.requiresConfirmation).toBe(true)
    expect(proposal.proposalId).toBeTruthy()
    expect(proposal.project.furniture).toEqual(initial.furniture)
    await expect(confirmation(page)).toBeVisible()

    const confirming = savedResponse(
      page,
      `/projects/${initial.id}/layout/commands/confirm`,
      "POST"
    )
    await confirmation(page)
      .getByRole("button", { name: "변경 적용", exact: true })
      .click()
    const confirmed = (await (await confirming).json()) as CommandResponse
    expect(confirmed.project.furniture).toEqual([])
    expect(confirmed.project.revision).toBe(initial.revision! + 1)
    await expect(confirmation(page)).not.toBeVisible()
    await reloadProject(page, confirmed.project)
  }
)
