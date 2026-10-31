import { defineConfig } from "@playwright/test"
import serverConfig from "./playwright.config"

export default defineConfig(serverConfig, {
  testMatch: "**/ollama-live.spec.ts",
  testIgnore: [],
})
