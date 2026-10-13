import { spawn, spawnSync } from "node:child_process"
import { createWriteStream } from "node:fs"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { randomUUID } from "node:crypto"
import { ProcessGroups } from "./process-groups.mjs"
import { startGeminiStub } from "./cloud-ai/provider-stub.mjs"
import {
  isolatedEnvironment,
  playwrightArguments,
  requireDiskSpace,
  unusedPort,
  waitUntil,
} from "./runtime.mjs"

const supplied = process.argv.slice(2)
const cloudAi = supplied[0] === "--cloud-ai"
const testArguments = playwrightArguments(
  cloudAi ? supplied.slice(1) : supplied
)
const frontend = dirname(dirname(fileURLToPath(import.meta.url)))
const backend = join(frontend, "../backend")
const runId = `kokoro-e2e-${randomUUID()}`
const env = isolatedEnvironment()
const logs = join(frontend, ".e2e-artifacts", runId)
const groups = new ProcessGroups()
let shutdown
const outputStreams = []
const abort = new AbortController()
let temporary
let failed = false
let provider

function interrupt() {
  abort.abort()
  shutdown ??= groups.stop()
  void shutdown.catch(() => {})
}
process.once("SIGINT", interrupt)
process.once("SIGTERM", interrupt)

function terminate(child, signal) {
  if (!child.pid) return
  try {
    process.kill(-child.pid, signal)
  } catch (error) {
    if (error.code !== "ESRCH") throw error
  }
}

function start(name, command, args, cwd = frontend, extraEnv = {}) {
  if (abort.signal.aborted) throw new Error("E2E interrupted")
  const log = createWriteStream(join(logs, `${name}.log`))
  outputStreams.push(log)
  const child = spawn(command, args, {
    cwd,
    env: { ...env, ...extraEnv },
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  })
  groups.track(child.pid)
  let text = ""
  const finished = new Promise((resolve, reject) => {
    child.once("error", (error) => {
      if (child.pid) groups.leaderExited(child.pid)
      reject(error)
    })
    child.once("exit", (code, signal) => {
      groups.leaderExited(child.pid)
      if (code === 0) resolve(text)
      else reject(new Error(`${name} failed (${code ?? signal}); see ${logs}`))
    })
  })
  // Long-lived servers can fail before they are awaited by the cleanup path.
  void finished.catch(() => {})
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (chunk) => {
      log.write(chunk)
      text = (text + chunk).slice(-32_000)
      process.stdout.write(`[${name}] ${chunk}`)
    })
  return { child, finished }
}

async function command(
  name,
  executable,
  args,
  cwd,
  extraEnv,
  timeoutMs = 300_000
) {
  const running = start(name, executable, args, cwd, extraEnv)
  const timeout = setTimeout(
    () => terminate(running.child, "SIGKILL"),
    timeoutMs
  )
  try {
    return await running.finished
  } finally {
    clearTimeout(timeout)
  }
}

function ready(url, running) {
  return waitUntil(
    async () => {
      try {
        return (await fetch(url, { signal: AbortSignal.timeout(2000) })).ok
      } catch {
        return false
      }
    },
    {
      signal: abort.signal,
      alive: () =>
        running.child.exitCode === null && running.child.signalCode === null,
    }
  )
}

try {
  if (process.platform === "win32")
    throw new Error("Use Linux or macOS for the E2E runner")
  await requireDiskSpace(frontend)
  await requireDiskSpace(tmpdir())
  await mkdir(logs, { recursive: true })
  const dockerEndpoint = await command("docker-context", "docker", [
    "context",
    "inspect",
    "--format",
    '{{(index .Endpoints "docker").Host}}',
  ])
  if (!dockerEndpoint.trim().startsWith("unix://"))
    throw new Error("E2E requires a local Docker socket")
  temporary = await mkdtemp(join(tmpdir(), "kokoro-e2e-"))
  const apiPort = await unusedPort()
  let webPort = await unusedPort()
  while (webPort === apiPort) webPort = await unusedPort()
  const api = `http://127.0.0.1:${apiPort}`
  const web = `http://127.0.0.1:${webPort}`
  if (cloudAi) provider = await startGeminiStub()

  await command("postgres-start", "docker", [
    "run",
    "--detach",
    "--rm",
    "--name",
    runId,
    "--label",
    `kokoro.e2e=${runId}`,
    "--publish",
    "127.0.0.1::5432",
    "--env",
    "POSTGRES_DB=kokoro_e2e",
    "--env",
    "POSTGRES_USER=kokoro_e2e",
    "--env",
    "POSTGRES_PASSWORD=e2e-only",
    "postgres:16-alpine",
  ])
  const portText = await command("postgres-port", "docker", [
    "inspect",
    "--format",
    '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}',
    runId,
  ])
  const databasePort = Number(portText.trim())
  if (
    !Number.isInteger(databasePort) ||
    databasePort < 1 ||
    databasePort > 65535
  )
    throw new Error("Invalid disposable PostgreSQL port")
  await waitUntil(
    async () => {
      const result = spawnSync(
        "docker",
        ["exec", runId, "pg_isready", "-U", "kokoro_e2e", "-d", "kokoro_e2e"],
        { env, timeout: 3000, stdio: "ignore" }
      )
      return result.status === 0
    },
    { signal: abort.signal }
  )

  await command(
    "backend-build",
    "./mvnw",
    ["--batch-mode", "package", "-DskipTests"],
    backend
  )
  const java = env.JAVA_HOME ? join(env.JAVA_HOME, "bin/java") : "java"
  const server = start(
    "spring",
    java,
    [
      "-jar",
      join(backend, "target/kokoro-api-0.1.0.jar"),
      "--spring.config.location=classpath:/application.yml",
      "--spring.profiles.active=local",
      "--app.security.mode=local",
      `--spring.datasource.url=jdbc:postgresql://127.0.0.1:${databasePort}/kokoro_e2e`,
      "--spring.datasource.username=kokoro_e2e",
      "--spring.datasource.password=e2e-only",
      `--app.floor-plan-storage-root=${join(temporary, "uploads")}`,
      "--server.address=127.0.0.1",
      `--server.port=${apiPort}`,
      `--app.frontend-origin=${web}`,
      ...(cloudAi
        ? [
            "--app.ai.api-key=e2e-test-key-only",
            `--app.ai.base-url=${provider.url}`,
            "--app.ai.timeout-ms=8000",
          ]
        : []),
    ],
    backend
  )
  await ready(`${api}/actuator/health`, server)
  const client = start(
    "vite",
    "vp",
    ["dev", "--host", "127.0.0.1", "--port", String(webPort), "--strictPort"],
    frontend,
    {
      VITE_API_MODE: cloudAi ? "local" : "server",
      VITE_API_BASE_URL: `${api}/api`,
    }
  )
  await ready(web, client)
  await command(
    "playwright",
    "vp",
    [
      ...testArguments,
      ...(cloudAi ? ["--config=playwright.cloud-ai.config.ts"] : []),
    ],
    frontend,
    {
      KOKORO_E2E_WEB: web,
      KOKORO_E2E_API: `${api}/api`,
      ...(cloudAi ? { KOKORO_E2E_PROVIDER: provider.url } : {}),
      CI: process.env.CI ? "true" : "",
    },
    600_000
  )
} catch (error) {
  failed = true
  console.error(error.message)
} finally {
  if (provider) await provider.close()
  await (shutdown ?? groups.stop()).catch((error) => {
    failed = true
    console.error(`Process cleanup failed: ${error.message}`)
  })
  // Stop only this run's labeled container, even after a partially failed docker run.
  const owned = spawnSync(
    "docker",
    ["inspect", "--format", '{{index .Config.Labels "kokoro.e2e"}}', runId],
    { env, encoding: "utf8", timeout: 5000 }
  )
  if (owned.stdout?.trim() === runId) {
    const stopped = spawnSync("docker", ["stop", "--time", "5", runId], {
      env,
      timeout: 15_000,
      stdio: "inherit",
    })
    if (stopped.status !== 0) {
      failed = true
      console.error(`Could not stop ${runId}`)
    }
  }
  if (temporary) await rm(temporary, { recursive: true, force: true })
  for (const stream of outputStreams) stream.end()
  process.exitCode = failed || abort.signal.aborted ? 1 : 0
}
