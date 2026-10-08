import { spawn } from "node:child_process"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import process from "node:process"
import { ProcessGroups } from "./process-groups.mjs"
import {
  isolatedEnvironment,
  playwrightArguments,
  requireDiskSpace,
  unusedPort,
  waitUntil,
} from "./runtime.mjs"

// Reject unsupported input before starting any child process.
const args = playwrightArguments(process.argv.slice(2))
const frontend = dirname(dirname(fileURLToPath(import.meta.url)))
const env = isolatedEnvironment()
const groups = new ProcessGroups()
const abort = new AbortController()
let shutdown

function interrupt() {
  abort.abort()
  shutdown ??= groups.stop()
  void shutdown.catch(() => {})
}
process.once("SIGINT", interrupt)
process.once("SIGTERM", interrupt)

function start(args, extraEnv) {
  if (abort.signal.aborted) throw new Error("E2E interrupted")
  const child = spawn("vp", args, {
    cwd: frontend,
    env: { ...env, ...extraEnv },
    detached: true,
    stdio: "inherit",
  })
  groups.track(child.pid)
  const finished = new Promise((resolve, reject) => {
    child.once("error", reject)
    child.once("exit", (code, signal) => {
      groups.leaderExited(child.pid)
      if (code === 0) resolve()
      else reject(new Error(`Local AI E2E process failed (${code ?? signal})`))
    })
  })
  void finished.catch(() => {})
  return { child, finished }
}

try {
  if (process.platform === "win32")
    throw new Error("Use Linux or macOS for the E2E runner")
  await requireDiskSpace(frontend)
  const port = await unusedPort()
  const web = `http://127.0.0.1:${port}`
  const vite = start(
    ["dev", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    { VITE_API_MODE: "local", VITE_API_BASE_URL: "" }
  )
  await waitUntil(
    async () => {
      try {
        return (await fetch(web, { signal: AbortSignal.timeout(2000) })).ok
      } catch {
        return false
      }
    },
    {
      signal: abort.signal,
      alive: () =>
        vite.child.exitCode === null && vite.child.signalCode === null,
    }
  )
  const running = start([...args, "--config=playwright.local-ai.config.ts"], {
    KOKORO_E2E_WEB: web,
    ...(process.env.CI ? { CI: "true" } : {}),
  })
  const timeout = setTimeout(interrupt, 300_000)
  try {
    await running.finished
    if (abort.signal.aborted) throw new Error("E2E interrupted")
  } finally {
    clearTimeout(timeout)
  }
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  try {
    await (shutdown ?? groups.stop())
  } catch (error) {
    console.error("Local AI E2E cleanup failed", error)
    process.exitCode = 1
  }
}
