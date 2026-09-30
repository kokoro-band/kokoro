import { describe, expect, it, vi } from "vite-plus/test"
import { statfs } from "node:fs/promises"
import {
  isolatedEnvironment,
  requireDiskSpace,
  unusedPort,
  waitUntil,
} from "./runtime.mjs"

vi.mock("node:fs/promises", () => ({ statfs: vi.fn() }))

describe("isolated E2E runtime", () => {
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
