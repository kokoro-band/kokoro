import { readFile } from "node:fs/promises"
import { expect, type APIRequestContext, type Page } from "@playwright/test"
import type { CommandResponse, Project } from "../src/features/studio/types"
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

const confirmation = (page: Page) =>
  page.getByRole("dialog", { name: "배치 변경 확인", exact: true })
const conflict = (page: Page) =>
  page.getByRole("dialog", { name: "서버 내용이 바뀌었어요", exact: true })
const confirmPath = (id: string) => `/projects/${id}/layout/commands/confirm`

async function read(request: APIRequestContext, id: string) {
  const response = await request.get(`${apiURL}/projects/${id}`)
  expect(response.status()).toBe(200)
  return (await response.json()) as Project
}

async function prepare(page: Page, narrow: boolean, ids: string[]) {
  const room = await createRoom(page, (id) => ids.push(id))
  await openFurniture(page, narrow)
  const project = await projectResponse(
    await addFurniture(page, room.id, "셸 체어")
  )
  if (narrow) {
    await page
      .locator(".mobile-sheet")
      .getByRole("button", { name: "닫기", exact: true })
      .click()
    await expect(page.locator(".mobile-sheet")).toHaveCount(0)
  }
  await page
    .getByRole(narrow ? "button" : "tab", { name: "AI 배치", exact: true })
    .click()
  return project
}

async function propose(page: Page, initial: Project) {
  await page
    .getByRole("textbox", { name: "가구 배치 요청", exact: true })
    .fill("방을 비워줘")
  const pending = savedResponse(
    page,
    `/projects/${initial.id}/layout/commands`,
    "POST"
  )
  await page.getByRole("button", { name: "요청 보내기", exact: true }).click()
  const response = await pending
  expect(response.status()).toBe(200)
  const proposal = (await response.json()) as CommandResponse
  expect(proposal.requiresConfirmation).toBe(true)
  expect(proposal.proposalId).toBeTruthy()
  expect(proposal.expiresAt).toBeTruthy()
  expect(proposal.proposedCommands.map((command) => command.type)).toEqual([
    "CLEAR",
  ])
  expect(proposal.project.furniture).toEqual(initial.furniture)
  expect(proposal.project.revision).toBe(initial.revision)
  await expect(confirmation(page)).toBeVisible()
  return proposal
}

function recordConfirmations(page: Page, id: string) {
  const bodies: unknown[] = []
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith(confirmPath(id)))
      bodies.push(request.postDataJSON())
  })
  return bodies
}

async function editElsewhere(other: Page, previous: Project) {
  const loaded = savedResponse(other, `/projects/${previous.id}`, "GET")
  await other.goto("/")
  const current = await projectResponse(await loaded)
  expect(current.revision).toBe(previous.revision)
  expect(current.furniture).toEqual(previous.furniture)
  await other.getByRole("button", { name: "구조", exact: true }).click()
  const name = other.getByRole("textbox", { name: "이름", exact: true })
  await name.fill("다른 탭의 거실")
  await name.press("Enter")
  const saved = savedResponse(other, `/projects/${previous.id}/room`)
  await other.getByRole("button", { name: "구조 저장", exact: true }).click()
  const latest = await projectResponse(await saved)
  expect(latest.revision).toBe(previous.revision! + 1)
  expect(latest.room).not.toEqual(previous.room)
  return latest
}

suite(
  "command cancellation and UI expiry never confirm or change the server",
  async ({ page, request, projectIds }, info) => {
    const initial = await prepare(
      page,
      info.project.name === "narrow",
      projectIds
    )
    const bodies = recordConfirmations(page, initial.id)
    await propose(page, initial)
    if (info.project.name === "narrow")
      await expect(
        page.locator('.mobile-sheet[aria-modal="true"]')
      ).toHaveCount(0)
    await confirmation(page)
      .getByRole("button", { name: "취소", exact: true })
      .click()
    await expect(confirmation(page)).not.toBeVisible()
    await expect(
      page.getByRole("textbox", { name: "가구 배치 요청", exact: true })
    ).toBeFocused()
    expect(bodies).toEqual([])
    expect(await read(request, initial.id)).toMatchObject({
      revision: initial.revision,
      furniture: initial.furniture,
    })
    const proposal = await propose(page, initial)
    // This changes browser Date only. Server-side TTL validation is a separate backend test.
    await page.clock.setFixedTime(Date.parse(proposal.expiresAt!) + 1000)
    await confirmation(page)
      .getByRole("button", { name: "변경 적용", exact: true })
      .click()
    await expect(
      confirmation(page).getByRole("button", { name: "다시 요청", exact: true })
    ).toBeVisible()
    expect(bodies).toEqual([])
    expect(await read(request, initial.id)).toMatchObject({
      revision: initial.revision,
      furniture: initial.furniture,
    })
  }
)

suite(
  "a stale command gets a real conflict and preserves the other tab's save",
  async ({ page, context, request, projectIds }, info) => {
    const initial = await prepare(
      page,
      info.project.name === "narrow",
      projectIds
    )
    const proposal = await propose(page, initial)
    const bodies = recordConfirmations(page, initial.id)
    const other = await context.newPage()
    try {
      const latest = await editElsewhere(other, initial)
      const response = savedResponse(page, confirmPath(initial.id), "POST")
      await confirmation(page)
        .getByRole("button", { name: "변경 적용", exact: true })
        .click()
      expect((await response).status()).toBe(409)
      await expect(conflict(page)).toBeVisible()
      expect(bodies).toEqual([{ proposalId: proposal.proposalId }])
      expect(await read(request, initial.id)).toMatchObject({
        revision: latest.revision,
        room: latest.room,
        furniture: latest.furniture,
      })
    } finally {
      await other.close()
    }
  }
)

for (const externalEdit of [false, true]) {
  suite(
    `a lost committed command response retries once without duplicate apply${externalEdit ? " and surfaces an external edit" : " after UI expiry"}`,
    async ({ page, context, request, projectIds }, info) => {
      const initial = await prepare(
        page,
        info.project.name === "narrow",
        projectIds
      )
      const proposal = await propose(page, initial)
      const bodies = recordConfirmations(page, initial.id)
      let first: CommandResponse | undefined
      let firstStatus: number | undefined
      let attempts = 0
      await page.route(`**${confirmPath(initial.id)}`, async (route) => {
        if (route.request().method() !== "POST") return route.continue()
        if (++attempts !== 1) return route.continue()
        try {
          // Commit to real Spring/PostgreSQL before losing only the browser response.
          const response = await route.fetch()
          firstStatus = response.status()
          first = (await response.json()) as CommandResponse
        } finally {
          await route.abort("failed")
        }
      })
      const other = externalEdit ? await context.newPage() : undefined
      try {
        await confirmation(page)
          .getByRole("button", { name: "변경 적용", exact: true })
          .click()
        const retry = confirmation(page).getByRole("button", {
          name: "같은 요청 다시 확인",
          exact: true,
        })
        await expect(retry).toBeVisible()
        expect(firstStatus).toBe(200)
        expect(first?.appliedActions).toEqual(["전체 삭제"])
        expect(first?.commands.map((command) => command.type)).toEqual([
          "CLEAR",
        ])
        const committed = await read(request, initial.id)
        expect(committed.furniture).toEqual([])
        expect(committed.revision).toBe(initial.revision! + 1)
        expect(first?.project).toMatchObject({
          revision: committed.revision,
          furniture: [],
        })
        // Load the second tab only AFTER the clear commit so its write uses the current revision.
        const latest = other ? await editElsewhere(other, committed) : committed
        await page.clock.setFixedTime(Date.parse(proposal.expiresAt!) + 1000)
        const repeated = savedResponse(page, confirmPath(initial.id), "POST")
        await retry.click()
        const response = await repeated
        expect(response.status()).toBe(200)
        const replay = (await response.json()) as CommandResponse
        expect(replay.appliedActions).toEqual([])
        expect(replay.project).toMatchObject({
          revision: latest.revision,
          room: latest.room,
          furniture: [],
        })
        expect(bodies).toEqual([
          { proposalId: proposal.proposalId },
          { proposalId: proposal.proposalId },
        ])
        expect(attempts).toBe(2)
        expect(await read(request, initial.id)).toMatchObject({
          revision: latest.revision,
          room: latest.room,
          furniture: [],
        })
        if (other) {
          await expect(conflict(page)).toBeVisible()
          await conflict(page)
            .getByRole("button", { name: "나중에 해결", exact: true })
            .click()
          await expect(conflict(page)).not.toBeVisible()
          if (info.project.name === "narrow") {
            await page
              .locator(".mobile-sheet")
              .getByRole("button", { name: "닫기", exact: true })
              .click()
            await expect(page.locator(".mobile-sheet")).toHaveCount(0)
          }
          await page.getByRole("button", { name: /프로젝트 메뉴$/ }).click()
          const downloading = page.waitForEvent("download")
          await page
            .getByRole("menuitem", { name: "JSON으로 내보내기", exact: true })
            .click()
          const download = await downloading
          const draft = JSON.parse(
            await readFile((await download.path())!, "utf8")
          ) as Project
          expect(draft.id).toBe(initial.id)
          expect(draft.revision).toBe(initial.revision)
          expect(draft.room).toEqual(initial.room)
          expect(draft.furniture).toEqual(initial.furniture)
          await page
            .getByRole("button", { name: "저장 충돌 해결", exact: true })
            .click()
          await conflict(page)
            .getByRole("button", { name: "최신 내용 확인", exact: true })
            .click()
          await expect(conflict(page)).toContainText(
            `확인한 서버 버전 ${latest.revision}`
          )
          const accepted = page
            .waitForEvent("dialog")
            .then((dialog) => dialog.accept())
          await conflict(page)
            .getByRole("button", {
              name: "내 초안 버리고 서버 내용 사용",
              exact: true,
            })
            .click()
          await accepted
          await expect(conflict(page)).not.toBeVisible()
        } else {
          await expect(confirmation(page)).not.toBeVisible()
          if (info.project.name === "narrow") {
            await page
              .locator(".mobile-sheet")
              .getByRole("button", { name: "닫기", exact: true })
              .click()
            await expect(page.locator(".mobile-sheet")).toHaveCount(0)
          }
          await expect(page.getByRole("banner")).toContainText("저장됨")
        }
        await reloadProject(page, latest)
        expect(attempts).toBe(2)
      } finally {
        await page.unrouteAll({ behavior: "wait" })
        await other?.close()
      }
    }
  )
}
