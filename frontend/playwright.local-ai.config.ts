import { defineConfig } from "@playwright/test"
import serverConfig from "./playwright.config"

export default defineConfig(serverConfig, {
  testDir: "./e2e/local-ai",
  testIgnore: [],
})
