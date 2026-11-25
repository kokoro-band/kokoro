import { expect, test } from "@playwright/test"
import { sampleRoom } from "../src/features/studio/sample-room"
import type { Project } from "../src/features/studio/types"

test("VR entry controls and starting rooms remain reachable in a short viewport", async ({
  page,
}, info) => {
  const desktop = info.project.name === "desktop"
  await page.setViewportSize(
    desktop ? { width: 844, height: 390 } : { width: 667, height: 375 }
  )
  // The API demo has no floor plan. Use the furnished demo's multi-room plan.
  await page.route("**/projects/living-room-01", async (route) => {
    const response = await route.fetch()
    const project = (await response.json()) as Project
    await route.fulfill({
      response,
      json: {
        ...project,
        room: sampleRoom,
        dimensions: { ...sampleRoom.bounds, height: sampleRoom.wallHeight },
        furniture: [],
      },
    })
  })
  await page.goto("./")
  await page.getByRole("radio", { name: "VR", exact: true }).click()
  const entry = page.getByRole("region", { name: "VR 둘러보기" })
  await entry.getByText("컨트롤러 조작법", { exact: true }).click()
  await expect(entry.getByText("왼쪽 스틱", { exact: true })).toBeVisible()
  if (desktop) {
    await page.getByRole("button", { name: "전체 화면으로 보기" }).click()
    await expect(
      page.getByRole("button", { name: "전체 화면 끝내기" })
    ).toBeVisible()
  }
  await entry.getByText("시작할 방 바꾸기", { exact: true }).click()
  await entry.getByRole("button", { name: /^안방 들어가기/ }).click()
  await expect(entry.getByText("안방에서 시작해요.")).toBeVisible()
  await entry.getByRole("button", { name: "3D로 돌아가기" }).click()
  await expect(
    page.getByRole("radio", { name: "3D", exact: true })
  ).toBeChecked()
  await expect(
    page.getByRole("navigation", { name: "공간 보기" })
  ).toContainText("안방")
})
