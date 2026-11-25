import { expect } from "@playwright/test"
import {
  suite,
  savedResponse,
  projectResponse,
  reloadProject,
  expectPersistedProject,
} from "./helpers"
import {
  choose,
  openPlan,
  pdf,
  planDialog,
  png,
  prepare,
  preserved,
  read,
  ready,
  recordUploads,
  upload,
} from "./upload-helpers"

const importing = (page: Parameters<typeof planDialog>[0]) =>
  page.getByRole("dialog", { name: "도면 이미지로 시작", exact: true })

suite(
  "browser image analysis can be cancelled or saved without uploading the original",
  async ({ page, request, projectIds }) => {
    const initial = await prepare(page, false, projectIds)
    const posts = recordUploads(page, initial.id)
    const image = await png(page)
    for (const cancel of [true, false]) {
      await page.getByRole("button", { name: "새로 시작", exact: true }).click()
      await page.getByRole("menuitem", { name: /^도면 이미지로 시작/ }).click()
      const dialog = importing(page)
      await choose(
        page,
        dialog.getByRole("button", { name: "도면 이미지 고르기", exact: true }),
        image
      )
      await expect(dialog).toContainText("방 2개를 찾았어요")
      await expect(
        dialog.getByRole("button", { name: "이 배치로 시작", exact: true })
      ).toBeEnabled()
      expectPersistedProject(await read(request, initial.id), initial)
      if (cancel) {
        await dialog.getByRole("button", { name: "닫기", exact: true }).click()
        await expect(
          page.getByRole("textbox", { name: "이름", exact: true })
        ).toHaveValue("내 미저장 거실")
      } else {
        await dialog
          .getByRole("button", { name: "이 배치로 시작", exact: true })
          .click()
        await expect(dialog).not.toBeVisible()
        expectPersistedProject(await read(request, initial.id), initial)
        const saving = savedResponse(page, "/projects/" + initial.id + "/room")
        await page
          .getByRole("button", { name: "구조 저장", exact: true })
          .click()
        const saved = await projectResponse(await saving)
        expect(saved.room!.rooms).toHaveLength(2)
        expect(saved.room).not.toEqual(initial.room)
        expect(saved.floorPlan).toEqual(initial.floorPlan)
        expect(saved.furniture).toEqual(initial.furniture)
        expectPersistedProject(await read(request, initial.id), saved)
        await reloadProject(page, saved)
      }
    }
    expect(posts).toHaveLength(0)
  }
)

suite(
  "original PDF upload preserves geometry and unsaved edits, and READY means file processing only",
  async ({ page, request, projectIds }) => {
    const initial = await prepare(page, false, projectIds)
    const posts = recordUploads(page, initial.id)
    await openPlan(page)
    await upload(page, pdf())
    await ready(page, "original.pdf")
    await expect(planDialog(page)).toContainText(
      "방 구조나 실제 치수를 자동으로 추출한 결과는 아니에요"
    )
    const { exported, stored } = await preserved(page, request, initial)
    expect(exported.floorPlan).toEqual(stored.floorPlan)
    expect(exported.revision).toBe(stored.revision)
    expect(stored.floorPlan).toMatchObject({
      fileName: "original.pdf",
      status: "READY",
      progress: 100,
    })
    expect(posts).toHaveLength(1)
    const saving = savedResponse(page, "/projects/" + initial.id + "/room")
    await page.getByRole("button", { name: "구조 저장", exact: true }).click()
    const response = await saving
    expect(response.request().postDataJSON().expectedRevision).toBe(
      stored.revision
    )
    const saved = await projectResponse(response)
    expect(saved.room!.rooms[0].name).toBe("내 미저장 거실")
    expect(saved.floorPlan).toEqual(stored.floorPlan)
    await reloadProject(page, saved)
  }
)
