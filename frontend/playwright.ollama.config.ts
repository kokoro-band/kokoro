import { defineConfig } from "@playwright/test"
import serverConfig from "./playwright.config"

export default defineConfig(serverConfig, {
  testMatch: "**/ollama.spec.ts",
  testIgnore: [],
})
