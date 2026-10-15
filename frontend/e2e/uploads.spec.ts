import { Buffer } from "node:buffer"
import { expect } from "@playwright/test"
import type { Project } from "../src/features/studio/types"
import { suite, savedResponse, projectResponse, reloadProject } from "./helpers"
import {
  choose,
  closeSheet,
  exportProject,
  field,
  gate,
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

// Existing behavior is characterized first. Failures below are explicitly
// injected only where marked; successful HTTP results come from Spring/PG.
suite(
  "browser image analysis can be cancelled or saved without uploading the original",
  async ({ page, request, projectIds }, info) => {
    const initial = await prepare(
      page,
      info.project.name === "narrow",
      projectIds
    )
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
      expect(await read(request, initial.id)).toEqual(initial)
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
        expect(await read(request, initial.id)).toEqual(initial)
        const saving = savedResponse(page, "/projects/" + initial.id + "/room")
        await page
          .getByRole("button", { name: "구조 저장", exact: true })
          .click()
        const saved = await projectResponse(await saving)
        expect(saved.room!.rooms).toHaveLength(2)
        expect(saved.room).not.toEqual(initial.room)
        expect(saved.floorPlan).toEqual(initial.floorPlan)
        expect(saved.furniture).toEqual(initial.furniture)
        expect(await read(request, initial.id)).toEqual(saved)
        await reloadProject(page, saved)
      }
    }
    expect(posts).toHaveLength(0)
  }
)

suite(
  "image input rejection, empty selection and analysis failure preserve the draft until a real retry succeeds",
  async ({ page, request, projectIds }, info) => {
    const initial = await prepare(
      page,
      info.project.name === "narrow",
      projectIds
    )
    const posts = recordUploads(page, initial.id)
    await page.getByRole("button", { name: "새로 시작", exact: true }).click()
    await page.getByRole("menuitem", { name: /^도면 이미지로 시작/ }).click()
    const dialog = importing(page)
    const button = dialog.getByRole("button", {
      name: "도면 이미지 고르기",
      exact: true,
    })
    await choose(page, button)
    await expect(
      dialog.getByRole("button", { name: "이 배치로 시작", exact: true })
    ).toBeDisabled()
    for (const [file, message] of [
      [pdf(), "PNG, JPG, WebP 이미지만"],
      [
        {
          name: "oversize.png",
          mimeType: "image/png",
          buffer: Buffer.alloc(15 * 1024 * 1024 + 1),
        },
        "15MiB 이하",
      ],
      [
        {
          name: "disguised.png",
          mimeType: "image/png",
          buffer: Buffer.from("not a PNG"),
        },
        "파일을 읽지 못했어요",
      ],
    ] as const) {
      await choose(page, button, file)
      await expect(dialog).toContainText(message)
      expect(await read(request, initial.id)).toEqual(initial)
    }
    await choose(page, button, await png(page, true))
    await expect(dialog).toContainText("방을 찾지 못했어요")
    await expect(
      dialog.getByRole("button", { name: "이 배치로 시작", exact: true })
    ).toBeDisabled()
    await dialog.getByRole("button", { name: "다시 찾기", exact: true }).click()
    await expect(dialog).toContainText("방을 찾지 못했어요")
    await choose(
      page,
      dialog.getByRole("button", { name: "다른 이미지 고르기", exact: true }),
      await png(page)
    )
    await expect(dialog).toContainText("방 2개를 찾았어요")
    await dialog.getByRole("button", { name: "닫기", exact: true }).click()
    await expect(
      page.getByRole("textbox", { name: "이름", exact: true })
    ).toHaveValue("내 미저장 거실")
    expect(await read(request, initial.id)).toEqual(initial)
    expect(posts).toHaveLength(0)
  }
)

suite(
  "original PDF upload preserves geometry and unsaved edits, and READY means file processing only",
  async ({ page, request, projectIds }, info) => {
    const initial = await prepare(
      page,
      info.project.name === "narrow",
      projectIds
    )
    const posts = recordUploads(page, initial.id)
    await openPlan(page)
    await upload(page)
    await expect(planDialog(page)).toContainText("아직 올린 도면이 없어요")
    expect(posts).toHaveLength(0)
    expect(await read(request, initial.id)).toEqual(initial)
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

suite(
  "rejected originals preserve the prior file and draft, then a valid replacement succeeds",
  async ({ page, request, projectIds }, info) => {
    const initial = await prepare(
      page,
      info.project.name === "narrow",
      projectIds
    )
    const posts = recordUploads(page, initial.id)
    await openPlan(page)
    await upload(page, pdf())
    await ready(page, "original.pdf")
    const baseline = await read(request, initial.id)
    for (const [file, message] of [
      [
        {
          name: "unsupported.webp",
          mimeType: "image/webp",
          buffer: Buffer.from("webp"),
        },
        "PDF, PNG, JPG 파일만",
      ],
      [
        {
          name: "oversize.png",
          mimeType: "image/png",
          buffer: Buffer.alloc(15 * 1024 * 1024 + 1),
        },
        "15MB 이하",
      ],
      [
        { name: "empty.png", mimeType: "image/png", buffer: Buffer.alloc(0) },
        "비어 있는 파일",
      ],
    ] as const) {
      await upload(page, file)
      await expect(planDialog(page)).toContainText(message)
      expect(await read(request, initial.id)).toEqual(baseline)
    }
    expect(posts).toHaveLength(1)
    const rejected = savedResponse(
      page,
      "/projects/" + initial.id + "/floor-plan",
      "POST"
    )
    await upload(page, {
      name: "disguised.png",
      mimeType: "image/png",
      buffer: Buffer.from("not a PNG"),
    })
    expect((await rejected).status()).toBe(415)
    await expect(planDialog(page)).toContainText(
      "파일의 확장자와 내용이 일치하는"
    )
    expect(await read(request, initial.id)).toEqual(baseline)
    const beforeRetry = await preserved(page, request, initial)
    expect(beforeRetry.exported.floorPlan).toEqual(baseline.floorPlan)
    await openPlan(page)
    await upload(page, await png(page))
    await ready(page, "two-rooms.png")
    const after = await preserved(page, request, initial)
    expect(after.stored.floorPlan.fileName).toBe("two-rooms.png")
    expect(after.stored.revision).toBeGreaterThan(baseline.revision!)
    expect(posts).toHaveLength(3)
  }
)

suite(
  "an upload connection failure preserves work and double-click retry uploads only once",
  async ({ page, request, projectIds }, info) => {
    const initial = await prepare(
      page,
      info.project.name === "narrow",
      projectIds
    )
    const arrived = gate()
    const release = gate()
    let attempts = 0
    await page.route(
      "**/projects/" + initial.id + "/floor-plan",
      async (route) => {
        if (route.request().method() !== "POST") return route.continue()
        if (++attempts === 1) return route.abort("connectionfailed") // Before forwarding: synthetic network failure.
        const response = await route.fetch({ maxRetries: 0 })
        arrived.release()
        await release.opened
        await route.fulfill({ response })
      }
    )
    try {
      await openPlan(page)
      await upload(page, pdf())
      const retry = planDialog(page).getByRole("button", {
        name: "같은 파일 다시 올리기",
        exact: true,
      })
      await expect(retry).toBeEnabled()
      expect(await read(request, initial.id)).toEqual(initial)
      await retry.dblclick()
      await arrived.opened
      expect(attempts).toBe(2)
      // On a narrow dialog the footer shrinks when retry starts, and the
      // second click may land on its backdrop. Closing does not cancel work.
      if (await planDialog(page).isVisible())
        await planDialog(page)
          .getByRole("button", { name: "닫기", exact: true })
          .click()
      await expect(
        page.getByRole("textbox", { name: "이름", exact: true })
      ).toHaveValue("내 미저장 거실")
      await openPlan(page)
      await expect(planDialog(page)).toContainText("original.pdf")
      await expect(
        planDialog(page).getByRole("button", {
          name: "다른 파일 올리기",
          exact: true,
        })
      ).toBeDisabled()
      release.release()
      await ready(page, "original.pdf")
      await preserved(page, request, initial)
      expect(attempts).toBe(2)
    } finally {
      release.release()
      await page.unrouteAll({ behavior: "wait" })
    }
  }
)

suite(
  "an injected processing failure offers a replacement without changing geometry or the draft",
  async ({ page, request, projectIds }, info) => {
    const initial = await prepare(
      page,
      info.project.name === "narrow",
      projectIds
    )
    let injected = 0
    await page.route("**/projects/" + initial.id, async (route) => {
      if (route.request().method() !== "GET") return route.continue()
      const response = await route.fetch({ maxRetries: 0 })
      expect(response.status()).toBe(200)
      const actual = (await response.json()) as Project
      // Only this failure is synthetic. The real job is allowed to finish in PG.
      injected++
      await route.fulfill({
        response,
        json: {
          ...actual,
          floorPlan: { ...actual.floorPlan, status: "FAILED" },
        },
      })
    })
    try {
      await openPlan(page)
      await upload(page, pdf())
      await expect(planDialog(page)).toContainText("도면을 처리하지 못했어요")
      await expect(
        planDialog(page).getByRole("button", {
          name: "다른 파일 올리기",
          exact: true,
        })
      ).toBeEnabled()
      const { stored } = await preserved(page, request, initial)
      expect(stored.floorPlan.status).toBe("READY")
      expect(injected).toBe(1)
    } finally {
      await page.unrouteAll({ behavior: "wait" })
    }
    await openPlan(page)
    await upload(page, pdf("replacement.pdf"))
    await ready(page, "replacement.pdf")
    await preserved(page, request, initial)
  }
)

suite(
  "a pending upload status read passes its revision through queued layout and room saves",
  async ({ page, request, projectIds }, info) => {
    const narrow = info.project.name === "narrow"
    const initial = await prepare(page, narrow, projectIds)
    const arrived = gate()
    const release = gate()
    let status!: Project
    const writes: { path: string; revision: number }[] = []
    page.on("request", (request) => {
      if (
        request.method() === "PUT" &&
        request.url().includes("/projects/" + initial.id + "/")
      )
        writes.push({
          path: request.url().split("/").at(-1)!,
          revision: request.postDataJSON().expectedRevision,
        })
    })
    await page.route("**/projects/" + initial.id, async (route) => {
      const response = await route.fetch({ maxRetries: 0 })
      expect(response.status()).toBe(200)
      status = (await response.json()) as Project
      arrived.release()
      await release.opened
      await route.fulfill({ response })
    })
    try {
      await openPlan(page)
      await upload(page, pdf())
      await arrived.opened
      expect(status.floorPlan.status).toBe("READY")
      await planDialog(page)
        .getByRole("button", { name: "닫기", exact: true })
        .click()
      await page.getByRole("button", { name: "배치", exact: true }).click()
      if (narrow)
        await page
          .getByRole("button", { name: "선택한 가구", exact: true })
          .click()
      await field(page, "가로", "2")
      await closeSheet(page, narrow)
      await page
        .getByRole("banner")
        .getByRole("button", { name: /^구조/ })
        .click()
      const savedRoom = savedResponse(page, "/projects/" + initial.id + "/room")
      await page.getByRole("button", { name: "구조 저장", exact: true }).click()
      expect(writes).toEqual([])
      release.release()
      const saved = await projectResponse(await savedRoom)
      expect(writes).toEqual([
        { path: "layout", revision: status.revision },
        { path: "room", revision: status.revision! + 1 },
      ])
      expect(saved.revision).toBe(status.revision! + 2)
      expect(saved.furniture[0]).toMatchObject({
        id: initial.furniture[0].id,
        x: 2,
      })
      expect(saved.room!.rooms[0].name).toBe("내 미저장 거실")
      expect(saved.floorPlan).toEqual(status.floorPlan)
      expect(await read(request, initial.id)).toEqual(saved)
      await reloadProject(page, saved)
    } finally {
      release.release()
      await page.unrouteAll({ behavior: "wait" })
    }
  }
)

suite(
  "changed server geometry in an upload status response opens recovery and never replaces the local draft",
  async ({ page, context, request, projectIds }, info) => {
    const initial = await prepare(
      page,
      info.project.name === "narrow",
      projectIds
    )
    const arrived = gate()
    const fetchNow = gate()
    const other = await context.newPage()
    let returned!: Project
    let writes = 0
    page.on("request", (request) => {
      if (request.method() === "PUT") writes++
    })
    await page.route("**/projects/" + initial.id, async (route) => {
      arrived.release()
      await fetchNow.opened
      const response = await route.fetch({ maxRetries: 0 })
      returned = (await response.json()) as Project
      await route.fulfill({ response })
    })
    try {
      await openPlan(page)
      const uploading = savedResponse(
        page,
        "/projects/" + initial.id + "/floor-plan",
        "POST"
      )
      await upload(page, pdf())
      const uploaded = await projectResponse(await uploading)
      await arrived.opened
      const loading = savedResponse(other, "/projects/" + initial.id, "GET")
      await other.goto("/")
      const current = await projectResponse(await loading)
      expect(current.floorPlan.status).toBe("READY")
      await other.getByRole("button", { name: "구조", exact: true }).click()
      await field(other, "이름", "다른 탭의 구조")
      const updating = savedResponse(other, "/projects/" + initial.id + "/room")
      await other
        .getByRole("button", { name: "구조 저장", exact: true })
        .click()
      const latest = await projectResponse(await updating)
      expect(latest.revision).toBe(current.revision! + 1)
      fetchNow.release()
      const conflict = page.getByRole("dialog", {
        name: "서버 내용이 바뀌었어요",
        exact: true,
      })
      await expect(conflict).toBeVisible()
      expect(returned.room).toEqual(latest.room)
      await conflict
        .getByRole("button", { name: "나중에 해결", exact: true })
        .click()
      await planDialog(page)
        .getByRole("button", { name: "닫기", exact: true })
        .click()
      await expect(
        page.getByRole("textbox", { name: "이름", exact: true })
      ).toHaveValue("내 미저장 거실")
      const exported = await exportProject(page)
      expect(exported.room).toEqual(initial.room)
      expect(exported.furniture).toEqual(initial.furniture)
      expect(exported.revision).toBe(uploaded.revision)
      expect(await read(request, initial.id)).toEqual(latest)
      expect(writes).toBe(0)
    } finally {
      fetchNow.release()
      await page.unrouteAll({ behavior: "wait" })
      await other.close()
    }
  }
)
