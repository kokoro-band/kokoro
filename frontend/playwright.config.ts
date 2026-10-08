import { defineConfig } from "@playwright/test"
import process from "node:process"

function localUrl(value: string | undefined) {
  const url = new URL(value ?? "http://127.0.0.1:1")
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    url.username ||
    url.password
  )
    throw new Error("E2E only accepts the runner's loopback URL")
  return url.toString()
}

export const apiURL = localUrl(process.env.KOKORO_E2E_API)
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  testIgnore: ["**/local-ai/**", "**/cloud-ai/**"],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: localUrl(process.env.KOKORO_E2E_WEB),
    browserName: "chromium",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 900 } } },
    { name: "narrow", use: { viewport: { width: 390, height: 844 } } },
  ],
})
