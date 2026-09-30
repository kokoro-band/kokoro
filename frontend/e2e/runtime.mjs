import { createServer } from "node:net"
import { statfs } from "node:fs/promises"

export function playwrightArguments(_args = []) {
  return ["exec", "playwright", "test"]
}

// Do not pass Spring overrides, production credentials, NODE_OPTIONS or JAVA_TOOL_OPTIONS.
export function isolatedEnvironment(source = process.env) {
  return Object.fromEntries(
    ["PATH", "HOME", "USER", "LOGNAME", "TMPDIR", "JAVA_HOME", "SystemRoot"]
      .filter((key) => typeof source[key] === "string")
      .map((key) => [key, source[key]])
  )
}

export async function requireDiskSpace(path) {
  const { bavail, bsize } = await statfs(path)
  if (bavail * bsize < 1024 ** 3)
    throw new Error(
      "E2E needs at least 1 GiB free before building. No files were removed."
    )
}

export async function unusedPort() {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  const port = server.address().port
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  )
  return port
}

/** @param {() => Promise<boolean>} probe
 * @param {{timeoutMs?: number, alive?: () => boolean, signal?: AbortSignal}} options
 */
export async function waitUntil(
  probe,
  { timeoutMs = 60_000, alive = () => true, signal } = {}
) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (signal?.aborted) throw new Error("E2E interrupted")
    if (!alive()) throw new Error("E2E service exited before becoming ready")
    if (await probe()) return
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw new Error("E2E service readiness timed out")
}
