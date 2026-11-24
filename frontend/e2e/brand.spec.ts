import { expect, test } from "@playwright/test"

test("the Kokoro header and tab share the logo and the header link focuses the workspace", async ({
  page,
  request,
}) => {
  await page.goto("./")
  const brand = page.getByRole("link", { name: "코코로", exact: true })
  const logo = brand.locator("img")
  await expect(logo).toBeInViewport({ ratio: 1 })
  await expect
    .poll(() => logo.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0)
  const logoUrl = await logo.evaluate((img: HTMLImageElement) => img.currentSrc)
  const faviconUrl = await page
    .locator('link[rel="icon"]')
    .evaluate((link: HTMLLinkElement) => link.href)
  expect(logoUrl).toBe(new URL("assets/brand/kokoro-logo.png", page.url()).href)
  expect(faviconUrl).toBe(logoUrl)
  const icon = await request.get(faviconUrl)
  expect(icon.ok()).toBe(true)
  expect(icon.headers()["content-type"]).toContain("image/png")

  const projectMenu = page.getByRole("button", { name: /프로젝트 메뉴$/ })
  await expect(projectMenu).toBeVisible()
  const logoBox = await brand.boundingBox()
  const menuBox = await projectMenu.boundingBox()
  expect(logoBox!.x + logoBox!.width).toBeLessThanOrEqual(menuBox!.x)
  await brand.focus()
  await brand.press("Enter")
  await expect(page.getByRole("main")).toBeFocused()
})
