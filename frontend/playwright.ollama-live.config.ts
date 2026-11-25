import { defineConfig } from "@playwright/test"
import serverConfig from "./playwright.config"

export default defineConfig(serverConfig, {
  testMatch: "**/ollama-live.spec.ts",
  testIgnore: [],
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 900 } } },
  ],
})
