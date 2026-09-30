import { expect } from "@playwright/test"
import type { Project } from "../src/features/studio/types"
import { apiURL } from "../playwright.config"
import {
  suite,
  createRoom,
  openFurniture,
  addFurniture,
  savedResponse,
  projectResponse,
  summary,
} from "./helpers"

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
