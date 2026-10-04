import { readFile } from "node:fs/promises"
import { expect, type Locator, type Page } from "@playwright/test"
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
  summary,
} from "./helpers"

async function field(page: Page, name: string, value: string) {
  const input = page.getByRole("textbox", { name, exact: true })
  await input.fill(value)
  await input.press("Enter")
}

// Read rendered SVG geometry only. All edits still use real pointer events.
async function point(page: Page, x: number, y: number) {
  const svg = page.getByLabel("방 배치 편집기", { exact: true })
  await svg.scrollIntoViewIfNeeded()
  return svg.evaluate(
    (element, coordinates) => {
      const matrix = (element as SVGSVGElement).getScreenCTM()!
      const screen = new DOMPoint(...coordinates).matrixTransform(matrix)
      return { x: screen.x, y: screen.y }
    },
    [x, y]
  )
}
async function clickPlan(page: Page, x: number, y: number) {
  const at = await point(page, x, y)
  await page.mouse.click(at.x, at.y)
}
async function dragPlan(
  page: Page,
  from: [number, number],
  to: [number, number]
) {
  const start = await point(page, ...from)
  const end = await point(page, ...to)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(end.x, end.y, { steps: 8 })
  await page.mouse.up()
}
async function saveStructure(page: Page, previous: Project) {
  const response = savedResponse(page, `/projects/${previous.id}/room`)
  await page.getByRole("button", { name: "구조 저장", exact: true }).click()
  const saved = await projectResponse(await response)
  expect(saved.revision).toBe(previous.revision! + 1)
  await expect(page.getByRole("banner")).toContainText("저장됨")
  return saved
}
async function rectangle(page: Page) {
  await page.getByRole("button", { name: "구조", exact: true }).click()
  await field(page, "가로", "6")
  await field(page, "세로", "4")
}
async function closeSheet(page: Page, narrow: boolean) {
  if (narrow) {
    await page
      .locator(".mobile-sheet")
      .getByRole("button", { name: "닫기", exact: true })
      .click()
    // The closing sheet still owns modal focus until its exit animation ends.
    await expect(page.locator(".mobile-sheet")).toHaveCount(0)
    await expect(page.locator('[aria-modal="true"]')).toHaveCount(0)
  }
}
async function changedPixels(canvas: Locator, before: Buffer) {
  expect((await stableCanvas(canvas)).equals(before)).toBe(false)
}
async function stableCanvas(canvas: Locator) {
  // A locator screenshot includes DOM overlays above the canvas. Compare the
  // rendered room only, not transient save notices or the floating toolbar.
  const options = {
    style:
      ".viewport-overlay, .seed-snackbar__root { visibility: hidden !important; }",
  }
  let previous = await canvas.screenshot(options)
  let equalFrames = 0
  await expect
    .poll(async () => {
      const current = await canvas.screenshot(options)
      equalFrames = current.equals(previous) ? equalFrames + 1 : 0
      previous = current
      return equalFrames
    })
    .toBeGreaterThanOrEqual(3)
  return previous
}

suite(
  "room area, edge resize, split and history persist",
  async ({ page, projectIds }) => {
    const initial = await createRoom(page, (id) => projectIds.push(id))
    await page.getByRole("button", { name: "구조", exact: true }).click()
    await field(page, "전용면적", "10")
    await page
      .getByRole("button", { name: "모든 방을 10평에 맞추기", exact: true })
      .click()
    const width = Number(
      await page
        .getByRole("textbox", { name: "가로", exact: true })
        .inputValue()
    )
    const depth = Number(
      await page
        .getByRole("textbox", { name: "세로", exact: true })
        .inputValue()
    )
    expect((width * depth) / 3.3058).toBeCloseTo(10, 0)
    await field(page, "가로", "6")
    await field(page, "세로", "4")
    await dragPlan(page, [6, 2], [6.5, 2])
    await expect(
      page.getByRole("textbox", { name: "가로", exact: true })
    ).toHaveValue("6.5")
    await page.getByRole("button", { name: "실행 취소", exact: true }).click()
    await expect(
      page.getByRole("textbox", { name: "가로", exact: true })
    ).toHaveValue("6.0")
    await page.getByRole("button", { name: "다시 실행", exact: true }).click()
    await expect(
      page.getByRole("textbox", { name: "가로", exact: true })
    ).toHaveValue("6.5")
    await page.getByRole("radio", { name: "나누기", exact: true }).click()
    await clickPlan(page, 3, 2)
    await expect(page.locator(".plan-room")).toHaveCount(2)
    await page.getByRole("radio", { name: "이동", exact: true }).click()
    await page
      .getByRole("button", { name: "거실 선택", exact: true })
      .press("Enter")
    await field(page, "이름", "작업방")
    const saved = await saveStructure(page, initial)
    expect(saved.room!.bounds).toEqual({ width: 6.5, depth: 4 })
    expect(saved.room!.rooms).toHaveLength(2)
    expect(
      saved.room!.rooms.find((room) => room.name === "작업방")!.polygon
    ).toEqual([
      [0, 0],
      [3, 0],
      [3, 4],
      [0, 4],
    ])
    await reloadProject(page, saved)
    await page.getByRole("button", { name: "구조", exact: true }).click()
    await expect(page.locator(".plan-room")).toHaveCount(2)
    await expect(
      page.getByRole("button", { name: "작업방 선택", exact: true })
    ).toBeVisible()
  }
)

suite(
  "opening inputs and handles persist, merging removes only the shared opening",
  async ({ page, projectIds }) => {
    const initial = await createRoom(page, (id) => projectIds.push(id))
    await rectangle(page)
    await page.getByRole("radio", { name: "문·창", exact: true }).click()
    await clickPlan(page, 2, 0)
    const door = page.getByRole("button", { name: /^문 선택 / })
    await door.press("Enter")
    await field(page, "벽 시작점에서 거리", "0.5")
    await field(page, "폭", "0.8")
    await dragPlan(page, [1.3, 0], [1.5, 0])
    await expect(
      page.getByRole("textbox", { name: "폭", exact: true })
    ).toHaveValue("1.00")
    await page.getByRole("radio", { name: "창", exact: true }).click()
    await clickPlan(page, 4, 4)
    await page.getByRole("button", { name: /^창문 선택 / }).press("Enter")
    await field(page, "벽 시작점에서 거리", "0.6")
    await field(page, "폭", "1.2")
    await dragPlan(page, [4.8, 4], [4.4, 4])
    await expect(
      page.getByRole("textbox", { name: "벽 시작점에서 거리", exact: true })
    ).toHaveValue("1.00")
    const saved = await saveStructure(page, initial)
    expect(saved.room!.openings).toHaveLength(2)
    expect(
      saved.room!.openings.find((opening) => opening.type === "door")
    ).toMatchObject({ from: 0.5, to: 1.5 })
    const window = saved.room!.openings.find(
      (opening) => opening.type === "window"
    )!
    expect(window.to - window.from).toBeCloseTo(1.2)
    expect(window.from).toBe(1)
    await reloadProject(page, saved)
    await page.getByRole("button", { name: "구조", exact: true }).click()
    await expect(page.locator(".plan-opening")).toHaveCount(2)
    await page.getByRole("radio", { name: "나누기", exact: true }).click()
    await clickPlan(page, 3, 2)
    await expect(page.locator(".plan-room")).toHaveCount(2)
    await page.getByRole("radio", { name: "문·창", exact: true }).click()
    await page.getByRole("radio", { name: "문", exact: true }).click()
    await clickPlan(page, 3, 2)
    await expect(page.locator(".plan-opening")).toHaveCount(3)
    const divided = await saveStructure(page, saved)
    expect(divided.room!.rooms).toHaveLength(2)
    expect(divided.room!.openings).toHaveLength(3)
    await reloadProject(page, divided)
    await page.getByRole("button", { name: "구조", exact: true }).click()
    await page.getByRole("radio", { name: "합치기", exact: true }).click()
    await clickPlan(page, 3, 0.5)
    await expect(page.locator(".plan-room")).toHaveCount(1)
    await expect(page.locator(".plan-opening")).toHaveCount(2)
    const merged = await saveStructure(page, divided)
    expect(merged.room!.openings).toEqual(saved.room!.openings)
    await reloadProject(page, merged)
  }
)

suite(
  "shrinking a room retains invalid furniture and lets the user repair it",
  async ({ page, projectIds }, info) => {
    const narrow = info.project.name === "narrow"
    const initial = await createRoom(page, (id) => projectIds.push(id))
    await openFurniture(page, narrow)
    const added = await projectResponse(
      await addFurniture(page, initial.id, "셸 체어")
    )
    await closeSheet(page, narrow)
    await page.getByRole("button", { name: "구조", exact: true }).click()
    await field(page, "가로", "2")
    await field(page, "세로", "2")
    const shrunk = await saveStructure(page, added)
    expect(shrunk.furniture).toEqual(added.furniture)
    expect(shrunk.room!.bounds).toEqual({ width: 2, depth: 2 })
    if (narrow)
      await page.getByRole("button", { name: "방 고르기", exact: true }).click()
    const issues = page.getByRole("region", {
      name: "배치 확인이 필요한 가구",
      exact: true,
    })
    await expect(issues).toBeVisible()
    await issues.getByRole("button", { name: /셸 체어/ }).click()
    const xResponse = savedResponse(page, `/projects/${initial.id}/layout`)
    await field(page, "가로", "1")
    const partial = await projectResponse(await xResponse)
    expect(partial.furniture[0]).toMatchObject({
      id: added.furniture[0].id,
      x: 1,
    })
    expect(partial.furniture[0].z).toBeGreaterThanOrEqual(0.425)
    expect(partial.furniture[0].z).toBeLessThanOrEqual(1.575)
    const zResponse = savedResponse(page, `/projects/${initial.id}/layout`)
    await field(page, "세로", "1")
    const repaired = await projectResponse(await zResponse)
    expect(repaired.furniture[0]).toMatchObject({
      id: added.furniture[0].id,
      x: 1,
      z: 1,
    })
    await expect(page.locator(".placement-issue-detail")).toHaveCount(0)
    await closeSheet(page, narrow)
    await summary(page, repaired, ["셸 체어"])
  }
)

suite(
  "furniture inputs clamp at the wall and rotation, undo and export agree",
  async ({ page, projectIds }, info) => {
    const narrow = info.project.name === "narrow"
    const initial = await createRoom(page, (id) => projectIds.push(id))
    await openFurniture(page, narrow)
    const added = await projectResponse(
      await addFurniture(page, initial.id, "셸 체어")
    )
    // Typing 1/2/3 must not change the selected cursor tool.
    const x = page.getByRole("textbox", { name: "가로", exact: true })
    await x.fill("")
    await x.pressSequentially("123")
    await expect(x).toHaveValue("123")
    await x.press("Escape")
    if (narrow)
      await expect(page.locator(".mobile-sheet[data-open]")).toHaveCount(0)
    await expect(
      page.getByRole("radio", { name: "가구 이동", exact: true })
    ).toBeChecked()
    if (narrow)
      await page
        .getByRole("button", { name: "선택한 가구", exact: true })
        .click()
    const movedResponse = savedResponse(page, `/projects/${initial.id}/layout`)
    await field(page, "가로", "0")
    const moved = await projectResponse(await movedResponse)
    // 0.65 m chair against a 0.2 m exterior wall: center = half width + half wall.
    expect(moved.furniture[0].x).toBeCloseTo(0.425, 2)
    expect(moved.furniture[0].z).toBe(added.furniture[0].z)
    await expect(
      page.getByRole("status").filter({ hasText: "벽이나 경계" })
    ).toBeVisible()
    const centeredResponse = savedResponse(
      page,
      `/projects/${initial.id}/layout`
    )
    await field(page, "가로", "2")
    const centered = await projectResponse(await centeredResponse)
    expect(centered.furniture[0].x).toBe(2)
    const rotatedResponse = savedResponse(
      page,
      `/projects/${initial.id}/layout`
    )
    await page
      .getByRole("slider", { name: "가구 방향", exact: true })
      .press("ArrowRight")
    const rotated = await projectResponse(await rotatedResponse)
    expect(rotated.furniture[0].rotation).toBe(15)
    await closeSheet(page, narrow)
    const undoneResponse = savedResponse(page, `/projects/${initial.id}/layout`)
    await page.getByRole("button", { name: "실행 취소", exact: true }).click()
    const undone = await projectResponse(await undoneResponse)
    expect(undone.furniture).toEqual(centered.furniture)
    const redoneResponse = savedResponse(page, `/projects/${initial.id}/layout`)
    await page.getByRole("button", { name: "다시 실행", exact: true }).click()
    const redone = await projectResponse(await redoneResponse)
    expect(redone.furniture).toEqual(rotated.furniture)
    await summary(page, redone, ["셸 체어"])
    await expect(page.locator(".summary-total")).toContainText("185,000")
    await expect(page.locator(".summary-total")).toContainText("가구 1개")
    await page.getByRole("button", { name: /프로젝트 메뉴$/ }).click()
    const downloading = page.waitForEvent("download")
    await page
      .getByRole("menuitem", { name: "JSON으로 내보내기", exact: true })
      .click()
    const download = await downloading
    expect(download.suggestedFilename()).toBe(`${redone.name}-layout.json`)
    const exported = JSON.parse(
      await readFile((await download.path())!, "utf8")
    ) as Project
    expect(exported.id).toBe(redone.id)
    expect(exported.revision).toBe(redone.revision)
    expect(exported.room).toEqual(redone.room)
    expect(exported.furniture).toEqual(redone.furniture)
  }
)

suite(
  "cursor keys route real canvas dragging to furniture or camera",
  async ({ page, request, projectIds }, info) => {
    const narrow = info.project.name === "narrow"
    const initial = await createRoom(page, (id) => projectIds.push(id))
    await openFurniture(page, narrow)
    const added = await projectResponse(
      await addFurniture(page, initial.id, "셸 체어")
    )
    await closeSheet(page, narrow)
    await page.getByRole("radio", { name: "2D", exact: true }).click()
    const canvas = page.locator(".room-renderer canvas")
    await expect(canvas).toBeVisible()
    for (const [key, name] of [
      ["1", "선택"],
      ["3", "화면 이동"],
      ["2", "가구 이동"],
    ]) {
      await page.keyboard.press(key)
      await expect(page.getByRole("radio", { name, exact: true })).toBeChecked()
    }
    const box = (await canvas.boundingBox())!
    const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    const movedResponse = savedResponse(page, `/projects/${initial.id}/layout`)
    await page.mouse.move(center.x, center.y)
    await page.mouse.down()
    await page.mouse.move(center.x + 30, center.y, { steps: 10 })
    await page.mouse.up()
    const moved = await projectResponse(await movedResponse)
    expect(moved.furniture[0].x).toBeGreaterThan(added.furniture[0].x)
    expect(moved.furniture[0].id).toBe(added.furniture[0].id)
    if (
      narrow &&
      (await page
        .locator(".mobile-sheet")
        .getByRole("button", { name: "닫기", exact: true })
        .isVisible())
    )
      await closeSheet(page, true)
    await page.keyboard.press("3")
    await expect(
      page.getByRole("radio", { name: "화면 이동", exact: true })
    ).toBeChecked()
    const before = await stableCanvas(canvas)
    const pan = (await canvas.boundingBox())!
    await page.mouse.move(pan.x + pan.width / 2, pan.y + pan.height / 2)
    await page.mouse.down()
    await page.mouse.move(pan.x + pan.width / 2 - 30, pan.y + pan.height / 2, {
      steps: 10,
    })
    await page.mouse.up()
    await changedPixels(canvas, before)
    const read = await request.get(`${apiURL}/projects/${initial.id}`)
    expect(read.status()).toBe(200)
    const afterPan = (await read.json()) as Project
    expect(afterPan.furniture).toEqual(moved.furniture)
    expect(afterPan.revision).toBe(moved.revision)
    await reloadProject(page, moved)
  }
)

suite(
  "door controls change the rendered scene in both 2D and 3D",
  async ({ page, projectIds }, info) => {
    const initial = await createRoom(page, (id) => projectIds.push(id))
    await rectangle(page)
    await page.getByRole("radio", { name: "문·창", exact: true }).click()
    await clickPlan(page, 2, 0)
    await expect(page.locator(".plan-opening")).toHaveCount(1)
    const saved = await saveStructure(page, initial)
    const canvas = page.locator(".room-renderer canvas")
    let previousMode: Buffer | undefined
    for (const mode of ["2D", "3D"]) {
      await page.getByRole("radio", { name: mode, exact: true }).click()
      await expect(
        page.getByRole("radio", { name: mode, exact: true })
      ).toBeChecked()
      await expect(canvas).toBeVisible()
      const closed = await stableCanvas(canvas)
      await info.attach(`${mode}-closed-before`, {
        body: closed,
        contentType: "image/png",
      })
      if (previousMode) expect(closed.equals(previousMode)).toBe(false)
      previousMode = closed
      await page
        .getByRole("button", { name: "문 열고 닫기", exact: true })
        .click()
      await page.getByRole("menuitem", { name: /열기$/ }).click()
      await expect(page.getByRole("menuitem", { name: /닫기$/ })).toBeVisible()
      await page.keyboard.press("Escape")
      const open = await stableCanvas(canvas)
      expect(open.equals(closed)).toBe(false)
      await info.attach(`${mode}-open`, {
        body: open,
        contentType: "image/png",
      })
      await page
        .getByRole("button", { name: "문 열고 닫기", exact: true })
        .click()
      await page.getByRole("menuitem", { name: /닫기$/ }).click()
      await expect(page.getByRole("menuitem", { name: /열기$/ })).toBeVisible()
      await page.keyboard.press("Escape")
      const closedAgain = await stableCanvas(canvas)
      expect(closedAgain.equals(open)).toBe(false)
      await info.attach(`${mode}-closed-after`, {
        body: closedAgain,
        contentType: "image/png",
      })
      expect(closedAgain.equals(closed)).toBe(true)
    }
    // Door pose is transient. Only the opening geometry is persisted.
    await reloadProject(page, saved)
  }
)

suite(
  "wall-limited fractional sofa rotation survives reload",
  async ({ page, projectIds }, info) => {
    const narrow = info.project.name === "narrow"
    const initial = await createRoom(page, (id) => projectIds.push(id))
    await openFurniture(page, narrow)
    await projectResponse(await addFurniture(page, initial.id, "클라우드 소파"))
    const movedResponse = savedResponse(page, `/projects/${initial.id}/layout`)
    await field(page, "세로", "0.7")
    const moved = await projectResponse(await movedResponse)
    expect(moved.furniture[0].z).toBeCloseTo(0.7, 10)
    const rotatedResponse = savedResponse(
      page,
      `/projects/${initial.id}/layout`
    )
    await page
      .getByRole("slider", { name: "가구 방향", exact: true })
      .press("ArrowRight")
    const rotated = await projectResponse(await rotatedResponse)
    const angle = rotated.furniture[0].rotation
    expect(angle).toBeGreaterThan(0)
    expect(angle).toBeLessThan(15)
    expect(Number.isInteger(angle)).toBe(false)
    // Independent rectangle footprint: half-depth along the wall normal.
    const halfDepth = (degrees: number) =>
      1.1 * Math.sin((degrees * Math.PI) / 180) +
      0.46 * Math.cos((degrees * Math.PI) / 180)
    expect(halfDepth(angle) + 0.1).toBeLessThanOrEqual(0.7)
    expect(halfDepth(angle + 0.5) + 0.1).toBeGreaterThan(0.7)
    await expect(
      page.getByRole("slider", { name: "가구 방향", exact: true })
    ).toHaveAttribute("aria-valuenow", String(angle))
    await closeSheet(page, narrow)
    await summary(page, rotated, ["클라우드 소파"])
  }
)
