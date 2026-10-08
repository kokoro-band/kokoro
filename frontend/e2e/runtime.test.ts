import { describe, expect, it, vi } from "vite-plus/test"
import { statfs } from "node:fs/promises"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import process from "node:process"
import {
  isolatedEnvironment,
  playwrightArguments,
  serverTestSetup,
  requireDiskSpace,
  unusedPort,
  waitUntil,
} from "./runtime.mjs"

vi.mock("node:fs/promises", () => ({ statfs: vi.fn() }))

describe("isolated E2E runtime", () => {
  it("detects even swallowed process calls in the invalid-CLI guard", () => {
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        fileURLToPath(
          new URL("./fixtures/forbid-child-process.mjs", import.meta.url)
        ),
        "--input-type=module",
        "-e",
        'import { spawnSync } from "node:child_process"; try { spawnSync("docker", ["inspect"]); } catch {}',
      ],
      { encoding: "utf8", env: { PATH: "" }, timeout: 5000 }
    )
    expect(result.status).toBe(0)
    expect(result.stderr).toContain("UNEXPECTED_CHILD_PROCESS")
  })
  it.each(["run.mjs", "run-local-ai.mjs"])(
    "%s rejects invalid CLI input before creating servers",
    (runner) => {
      const result = spawnSync(
        process.execPath,
        [
          "--import",
          fileURLToPath(
            new URL("./fixtures/forbid-child-process.mjs", import.meta.url)
          ),
          fileURLToPath(new URL(`./${runner}`, import.meta.url)),
          "--project=invalid",
        ],
        { encoding: "utf8", env: { PATH: "" }, timeout: 5000 }
      )
      expect(result.status).toBe(1)
      expect(result.stderr).toContain("--project=desktop or --project=narrow")
      expect(result.stdout).toBe("")
      expect(result.stderr).not.toContain("ENOENT")
      expect(result.stderr).not.toContain("UNEXPECTED_CHILD_PROCESS")
    }
  )
  it("runs every configured project by default", () => {
    expect(playwrightArguments()).toEqual(["exec", "playwright", "test"])
    expect(playwrightArguments([])).toEqual(["exec", "playwright", "test"])
  })
  it.each(["desktop", "narrow"])(
    "selects only the explicit %s project",
    (project) => {
      expect(playwrightArguments([`--project=${project}`])).toEqual([
        "exec",
        "playwright",
        "test",
        `--project=${project}`,
      ])
    }
  )
  it.each([
    ["--project=mobile"],
    ["--project="],
    ["--project=desktop", "--project=narrow"],
    ["--project=desktop", "--project=desktop"],
    ["--project=desktop", "--grep=login"],
    ["--project=desktop;echo unsafe"],
    ["--config=https://example.com"],
    ["--project", "desktop"],
    ["--"],
    [" "],
  ])("rejects unsupported or ambiguous arguments %j", (...args) => {
    expect(() => playwrightArguments(args)).toThrow(
      "--project=desktop or --project=narrow"
    )
  })
  it("keeps regular server tests on the current backend", () => {
    expect(
      serverTestSetup([], "/repo/frontend", { KOKORO_E2E_BACKEND: "/other" })
    ).toEqual({
      backend: "/repo/backend",
      args: ["exec", "playwright", "test"],
    })
  })
  it("runs Ollama integration only against an explicit dependency backend", () => {
    expect(
      serverTestSetup(["--ollama", "--project=narrow"], "/repo/frontend", {
        KOKORO_E2E_BACKEND: "/dependency/backend",
      })
    ).toEqual({
      backend: "/dependency/backend",
      args: [
        "exec",
        "playwright",
        "test",
        "--project=narrow",
        "--config=playwright.ollama.config.ts",
      ],
    })
    expect(() => serverTestSetup(["--ollama"], "/repo/frontend", {})).toThrow(
      "absolute backend path"
    )
    expect(() =>
      serverTestSetup(["--ollama"], "/repo/frontend", {
        KOKORO_E2E_BACKEND: "../backend",
      })
    ).toThrow("absolute backend path")
  })
  it("refuses low disk space before any builds", async () => {
    vi.mocked(statfs).mockResolvedValue({ bavail: 100, bsize: 4096 } as Awaited<
      ReturnType<typeof statfs>
    >)
    await expect(requireDiskSpace("/tmp")).rejects.toThrow("at least 1 GiB")
  })
  it("accepts the documented minimum free space", async () => {
    vi.mocked(statfs).mockResolvedValue({
      bavail: 262144,
      bsize: 4096,
    } as Awaited<ReturnType<typeof statfs>>)
    await expect(requireDiskSpace("/tmp")).resolves.toBeUndefined()
  })
  it("drops inherited runtime overrides and production endpoints", () => {
    expect(
      isolatedEnvironment({
        PATH: "/bin",
        HOME: "/tmp/example",
        JAVA_HOME: "/jdk",
        DB_URL: "production",
        SPRING_DATASOURCE_URL: "production",
        SPRING_APPLICATION_JSON: "secret",
        SPRING_CONFIG_LOCATION: "/secrets",
        JAVA_TOOL_OPTIONS: "override",
        NODE_OPTIONS: "override",
        VITE_API_BASE_URL: "https://production",
        DOCKER_HOST: "tcp://remote:2375",
      })
    ).toEqual({ PATH: "/bin", HOME: "/tmp/example", JAVA_HOME: "/jdk" })
  })
  it("stops immediately when a service has exited", async () => {
    const probe = vi.fn(async () => true)
    await expect(waitUntil(probe, { alive: () => false })).rejects.toThrow(
      "exited"
    )
    expect(probe).not.toHaveBeenCalled()
  })
  it("stops on cancellation without probing", async () => {
    const controller = new AbortController()
    controller.abort()
    const probe = vi.fn(async () => true)
    await expect(
      waitUntil(probe, { signal: controller.signal })
    ).rejects.toThrow("interrupted")
    expect(probe).not.toHaveBeenCalled()
  })
  it("reports an unmet readiness deadline", async () => {
    await expect(
      waitUntil(async () => false, { timeoutMs: 0 })
    ).rejects.toThrow("timed out")
  })
  it("returns only after readiness succeeds", async () => {
    await expect(waitUntil(async () => true)).resolves.toBeUndefined()
  })
  it("allocates a loopback port", async () => {
    expect(await unusedPort()).toBeGreaterThan(0)
  })
})
