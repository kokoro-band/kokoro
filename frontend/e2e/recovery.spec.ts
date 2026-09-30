import { expect, type APIRequestContext, type Page } from "@playwright/test"
import type { Project } from "../src/features/studio/types"
import { apiURL } from "../playwright.config"
import {
  suite,
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
  await expect(page.locator('[aria-modal="true"]')).toHaveCount(0)
}

async function read(request: APIRequestContext, id: string) {
  const response = await request.get(`${apiURL}/projects/${id}`)
  expect(response.status()).toBe(200)
  return (await response.json()) as Project
}

function conflict(page: Page) {
  return page.getByRole("dialog", {
    name: "서버 내용이 바뀌었어요",
    exact: true,
  })
}

async function preview(page: Page, revision: number) {
  await conflict(page)
    .getByRole("button", { name: "최신 내용 확인", exact: true })
    .click()
  await expect(conflict(page)).toContainText(`확인한 서버 버전 ${revision}`)
}

async function inspectUnsubmittedDraft(page: Page) {
  await page.getByRole("button", { name: "내역", exact: true }).click()
  await expect(page.locator(".summary")).toContainText("올리브 화분")
  await expect(page.locator(".summary")).not.toContainText("셸 체어")
  await expect(page.locator(".summary-total")).toContainText("가구 1개")
  await page.getByRole("button", { name: "구조", exact: true }).click()
  await expect(
    page.getByRole("textbox", { name: "이름", exact: true })
  ).toHaveValue("내 미저장 구조")
}

type Write = {
  path: string
  body: {
    expectedRevision: number
    furniture?: Project["furniture"]
    room?: Project["room"]
  }
}
function recordWrites(page: Page, id: string) {
  const writes: Write[] = []
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname
    if (
      request.method() === "PUT" &&
      ["room", "layout"].some((part) =>
        path.endsWith(`/projects/${id}/${part}`)
      )
    ) {
      writes.push({
        path: path.split("/").at(-1)!,
        body: request.postDataJSON(),
      })
    }
  })
  return writes
}

suite(
  "network retry exhaustion retains the edited draft and manual double click saves once",
  async ({ page, request, projectIds }, info) => {
    const narrow = info.project.name === "narrow"
    const initial = await createRoom(page, (id) => projectIds.push(id))
    await openFurniture(page, narrow)
    const saved = await projectResponse(
      await addFurniture(page, initial.id, "셸 체어")
    )
    const writes = recordWrites(page, initial.id)
    const manual = gate()
    let attempts = 0
    await page.route(`**/projects/${initial.id}/layout`, async (route) => {
      if (route.request().method() !== "PUT") return route.continue()
      attempts++
      // These three failures happen BEFORE forwarding, so the server is unchanged.
      if (attempts <= 3) return route.abort("connectionfailed")
      await manual.opened
      await route.continue()
    })
    try {
      await field(page, "가로", "2")
      await expect.poll(() => attempts).toBe(3)
      await expect(
        page.getByRole("textbox", { name: "가로", exact: true })
      ).toHaveValue("2.0")
      await closeSheet(page, narrow)
      const retry = page
        .getByRole("banner")
        .getByRole("button", { name: "다시 저장", exact: true })
      await expect(retry).toBeEnabled()
      expect(await read(request, initial.id)).toMatchObject({
        revision: saved.revision,
        furniture: saved.furniture,
      })
      const response = savedResponse(page, `/projects/${initial.id}/layout`)
      await retry.dblclick()
      await expect.poll(() => attempts).toBe(4)
      await expect(retry).toBeDisabled()
      manual.release()
      const restored = await projectResponse(await response)
      await expect(page.getByRole("banner")).toContainText("저장됨")
      expect(writes).toHaveLength(4)
      for (const write of writes) {
        expect(write.body.expectedRevision).toBe(saved.revision)
        expect(write.body.furniture![0]).toMatchObject({
          id: saved.furniture[0].id,
          x: 2,
        })
      }
      expect(restored.revision).toBe(saved.revision! + 1)
      expect(restored.furniture[0]).toMatchObject({
        id: saved.furniture[0].id,
        x: 2,
      })
      await reloadProject(page, restored)
      expect(attempts).toBe(4)
    } finally {
      manual.release()
      await page.unrouteAll({ behavior: "wait" })
    }
  }
)

// A real second tab advances the server. Hold only the stale tab's outgoing
// layout until its user has also edited (but not submitted) the structure.
async function conflictWithDraft(
  page: Page,
  other: Page,
  narrow: boolean,
  initial: Project
) {
  const loaded = savedResponse(other, `/projects/${initial.id}`, "GET")
  await other.goto("/")
  expect((await projectResponse(await loaded)).revision).toBe(initial.revision)
  await openFurniture(other, narrow)
  const latest = await projectResponse(
    await addFurniture(other, initial.id, "셸 체어")
  )
  await openFurniture(page, narrow)
  const outgoing = gate()
  const arrived = gate()
  await page.route(`**/projects/${initial.id}/layout`, async (route) => {
    if (route.request().method() !== "PUT") return route.continue()
    arrived.release()
    await outgoing.opened
    await route.continue()
  })
  try {
    const stale = savedResponse(page, `/projects/${initial.id}/layout`)
    await page
      .getByRole("button", { name: "올리브 화분 거실에 놓기", exact: true })
      .click()
    await arrived.opened
    await closeSheet(page, narrow)
    await page.getByRole("button", { name: "구조", exact: true }).click()
    await field(page, "이름", "내 미저장 구조")
    outgoing.release()
    expect((await stale).status()).toBe(409)
    await expect(conflict(page)).toBeVisible()
    return latest
  } finally {
    outgoing.release()
    await page.unrouteAll({ behavior: "wait" })
  }
}

suite(
  "conflict preview and dismiss preserve drafts, discard cancellation does not write",
  async ({ page, context, request, projectIds }, info) => {
    const initial = await createRoom(page, (id) => projectIds.push(id))
    const other = await context.newPage()
    const writes = recordWrites(page, initial.id)
    try {
      const latest = await conflictWithDraft(
        page,
        other,
        info.project.name === "narrow",
        initial
      )
      await preview(page, latest.revision!)
      expect(writes).toHaveLength(1)
      await conflict(page)
        .getByRole("button", { name: "나중에 해결", exact: true })
        .click()
      await expect(conflict(page)).not.toBeVisible()
      await inspectUnsubmittedDraft(page)
      await page
        .getByRole("button", { name: "저장 충돌 해결", exact: true })
        .click()
      await expect(conflict(page)).toBeVisible()
      const discard = conflict(page).getByRole("button", {
        name: "내 초안 버리고 서버 내용 사용",
        exact: true,
      })
      const cancelled = page.waitForEvent("dialog").then(async (dialog) => {
        expect(dialog.type()).toBe("confirm")
        expect(dialog.message()).toContain("미저장 변경을 버리고")
        await dialog.dismiss()
      })
      await discard.click()
      await cancelled
      await expect(conflict(page)).toBeVisible()
      await conflict(page)
        .getByRole("button", { name: "나중에 해결", exact: true })
        .click()
      await expect(conflict(page)).not.toBeVisible()
      await inspectUnsubmittedDraft(page)
      await page
        .getByRole("button", { name: "저장 충돌 해결", exact: true })
        .click()
      await expect(conflict(page)).toBeVisible()
      expect(writes).toHaveLength(1)
      expect(await read(request, initial.id)).toMatchObject({
        revision: latest.revision,
        furniture: latest.furniture,
        room: latest.room,
      })
      const accepted = page.waitForEvent("dialog").then(async (dialog) => {
        await dialog.accept()
      })
      await discard.click()
      await accepted
      await expect(conflict(page)).not.toBeVisible()
      await expect(
        page.getByRole("textbox", { name: "이름", exact: true })
      ).toHaveValue("거실")
      await expect(page.getByRole("banner")).toContainText("저장됨")
      expect(writes).toHaveLength(1)
      await reloadProject(page, latest)
      expect(writes).toHaveLength(1)
    } finally {
      await other.close()
    }
  }
)

for (const failure of ["room", "layout"] as const) {
  suite(
    `partial recovery ${failure} failure preserves room intent through edit, undo and retry`,
    async ({ page, context, request, projectIds }, info) => {
      const initial = await createRoom(page, (id) => projectIds.push(id))
      const other = await context.newPage()
      const writes = recordWrites(page, initial.id)
      try {
        const latest = await conflictWithDraft(
          page,
          other,
          info.project.name === "narrow",
          initial
        )
        await preview(page, latest.revision!)
        let rejected = 0
        await page.route(
          `**/projects/${initial.id}/${failure}`,
          async (route) => {
            if (route.request().method() !== "PUT") return route.continue()
            rejected++
            // Synthetic non-retryable rejection before forwarding. Any successful
            // room write in the layout-failure case still comes from real Spring.
            await route.fulfill({
              status: 400,
              contentType: "application/json",
              body: JSON.stringify({ message: "E2E 복구 요청 거절" }),
            })
          }
        )
        const rejectedResponse = savedResponse(
          page,
          `/projects/${initial.id}/${failure}`
        )
        await conflict(page)
          .getByRole("button", {
            name: "내 변경을 최신 내용에 적용",
            exact: true,
          })
          .click()
        expect((await rejectedResponse).status()).toBe(400)
        await expect(conflict(page).getByRole("alert")).toBeVisible()
        expect(rejected).toBe(1)
        await page.unrouteAll({ behavior: "wait" })
        const partial = await read(request, initial.id)
        expect(partial.furniture).toEqual(latest.furniture)
        expect(partial.revision).toBe(
          latest.revision! + (failure === "layout" ? 1 : 0)
        )
        expect(partial.room!.rooms[0].name).toBe(
          failure === "layout" ? "내 미저장 구조" : "거실"
        )
        expect(
          writes
            .slice(1)
            .map((write) => [write.path, write.body.expectedRevision])
        ).toEqual(
          failure === "layout"
            ? [
                ["room", latest.revision],
                ["layout", latest.revision! + 1],
              ]
            : [["room", latest.revision]]
        )
        await conflict(page)
          .getByRole("button", { name: "나중에 해결", exact: true })
          .click()
        await expect(conflict(page)).not.toBeVisible()
        await expect(
          page.getByRole("textbox", { name: "이름", exact: true })
        ).toHaveValue("내 미저장 구조")
        // A different field forms a distinct undo group without a timing sleep.
        await field(page, "가로", String(initial.room!.bounds.width + 1))
        await page
          .getByRole("button", { name: "실행 취소", exact: true })
          .click()
        await expect(
          page.getByRole("textbox", { name: "가로", exact: true })
        ).toHaveValue(initial.room!.bounds.width.toFixed(1))
        await expect(
          page.getByRole("textbox", { name: "이름", exact: true })
        ).toHaveValue("내 미저장 구조")
        await page
          .getByRole("button", { name: "저장 충돌 해결", exact: true })
          .click()
        await preview(page, partial.revision!)
        const beforeRetry = writes.length
        const savedResponsePromise = savedResponse(
          page,
          `/projects/${initial.id}/layout`
        )
        await conflict(page)
          .getByRole("button", {
            name: "내 변경을 최신 내용에 적용",
            exact: true,
          })
          .click()
        const saved = await projectResponse(await savedResponsePromise)
        await expect(conflict(page)).not.toBeVisible()
        const expectedWrites =
          failure === "room"
            ? [
                ["room", partial.revision],
                ["layout", partial.revision! + 1],
              ]
            : [["layout", partial.revision]]
        expect(
          writes
            .slice(beforeRetry)
            .map((write) => [write.path, write.body.expectedRevision])
        ).toEqual(expectedWrites)
        expect(saved.revision).toBe(partial.revision! + expectedWrites.length)
        expect(saved.room!.rooms[0].name).toBe("내 미저장 구조")
        expect(saved.room!.bounds).toEqual(initial.room!.bounds)
        expect(saved.furniture.map((item) => item.name).sort()).toEqual(
          ["셸 체어", "올리브 화분"].sort()
        )
        expect(
          saved.furniture.find((item) => item.id === latest.furniture[0].id)
        ).toEqual(latest.furniture[0])
        const draftPlant = writes[0].body.furniture![0]
        expect(
          saved.furniture.find((item) => item.id === draftPlant.id)
        ).toEqual(draftPlant)
        await reloadProject(page, saved)
      } finally {
        await page.unrouteAll({ behavior: "wait" })
        await other.close()
      }
    }
  )
}
