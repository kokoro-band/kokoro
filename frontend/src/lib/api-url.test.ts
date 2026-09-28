import { AxiosHeaders, type InternalAxiosRequestConfig } from "axios"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv("VITE_API_MODE", "server")
  vi.stubEnv("VITE_API_BASE_URL", "https://api.example.test/prefix/api")
  vi.stubEnv("DEV", false)
  vi.stubEnv("PROD", true)
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

async function client() {
  // Import must succeed even when server configuration is invalid.
  const api = await import("./http-client")
  const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => ({
    data: { ok: true },
    status: 200,
    statusText: "OK",
    headers: new AxiosHeaders(),
    config,
  }))
  api.httpClient.defaults.adapter = adapter
  return { ...api, adapter }
}

describe("configured API URL", () => {
  it.each([
    "",
    " ",
    "api",
    "//other.example/api",
    "javascript:alert(1)",
    "data:text/plain,secret",
    "file:///api",
    "http://api.example.test/api",
    "http://localhost:8080/api",
    "https://user:secret@api.example.test/api",
    "https://@api.example.test/api",
    "https://:@api.example.test/api",
    "https://api.example.test/api?token=secret",
    "https://api.example.test/api#secret",
    " https://api.example.test/api",
    "https://api.example.test/api\n",
    "https://api.example.test/\\other",
    "https://api.example.test/api/../admin",
    "https://api.example.test/%2e%2e/admin",
    "/api/../admin",
    "/%2f%2fother",
    "/api//other",
    "/api?token=secret",
  ])("blocks %s before transport without reflecting it", async (base) => {
    vi.stubEnv("VITE_API_BASE_URL", base)
    const api = await client()
    await expect(api.request({ url: "/projects" })).rejects.toMatchObject({
      name: "ApiError",
      status: null,
      retryable: false,
      message:
        "서버 주소 설정을 확인해 주세요. HTTPS 주소 또는 같은 출처의 API 경로가 필요해요.",
    })
    expect(api.adapter).not.toHaveBeenCalled()
  })

  it("rejects missing production configuration rather than using localhost", async () => {
    vi.stubEnv("VITE_API_BASE_URL", undefined)
    const api = await client()
    await expect(api.request({ url: "/projects" })).rejects.toMatchObject({
      retryable: false,
    })
    expect(api.adapter).not.toHaveBeenCalled()
  })

  it.each([
    [
      "https://api.example.test/prefix/api",
      "https://api.example.test/prefix/api/projects",
    ],
    [
      "https://api.example.test/prefix/api/",
      "https://api.example.test/prefix/api/projects",
    ],
    ["/api", "/api/projects"],
    ["/proxy/v1.0/api/", "/proxy/v1.0/api/projects"],
  ])("preserves the prefix for %s", async (base, expected) => {
    vi.stubEnv("VITE_API_BASE_URL", base)
    const api = await client()
    await expect(
      api.request({
        url: "/projects",
        params: { page: 1 },
        timeout: api.UPLOAD_TIMEOUT_MS,
      })
    ).resolves.toEqual({ ok: true })
    const sent = api.adapter.mock.calls[0][0]
    expect(api.httpClient.getUri(sent)).toBe(`${expected}?page=1`)
    expect(sent.timeout).toBe(api.UPLOAD_TIMEOUT_MS)
  })

  it.each([
    undefined,
    "http://localhost:8080/api",
    "http://127.0.0.1:8080/api",
    "http://[::1]:8080/api",
  ])("allows loopback development %s", async (base) => {
    vi.stubEnv("DEV", true)
    vi.stubEnv("PROD", false)
    vi.stubEnv("VITE_API_BASE_URL", base)
    const api = await client()
    await api.request({ url: "/projects" })
    expect(api.adapter).toHaveBeenCalledOnce()
    expect(api.httpClient.getUri(api.adapter.mock.calls[0][0])).toBe(
      `${base ?? "http://localhost:8080/api"}/projects`
    )
  })

  it.each([
    "http://192.168.0.1/api",
    "http://localhost.evil.test/api",
    "http://127.1/api",
    "http://0x7f000001/api",
  ])(
    "rejects noncanonical or non-loopback development HTTP %s",
    async (base) => {
      vi.stubEnv("DEV", true)
      vi.stubEnv("VITE_API_BASE_URL", base)
      const api = await client()
      await expect(api.request({ url: "/projects" })).rejects.toMatchObject({
        retryable: false,
      })
      expect(api.adapter).not.toHaveBeenCalled()
    }
  )

  it("does not send HTTP from an HTTPS development page", async () => {
    vi.stubEnv("DEV", true)
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost:8080/api")
    vi.stubGlobal("window", { location: { protocol: "https:" } })
    const api = await client()
    await expect(api.request({ url: "/projects" })).rejects.toMatchObject({
      retryable: false,
    })
    expect(api.adapter).not.toHaveBeenCalled()
  })
})

describe("per-request URL cannot bypass the configured API", () => {
  it.each([
    undefined,
    "",
    "projects",
    "https://other.example/projects",
    "https://api.example.test/projects",
    "//other.example/projects",
    "/\\other.example/projects",
    "/projects/../admin",
    "/%2e%2e/admin",
    "/projects/%252e%252e/admin",
    "/projects?redirect=other",
    "/projects#secret",
    "/projects\n",
    "/projects//other",
  ])("rejects %s even through the exported Axios client", async (url) => {
    const api = await client()
    await expect(api.httpClient.request({ url })).rejects.toMatchObject({
      name: "ApiError",
      retryable: false,
    })
    expect(api.adapter).not.toHaveBeenCalled()
  })

  it("rejects a per-request baseURL override", async () => {
    const api = await client()
    await expect(
      api.request({ url: "/projects", baseURL: "https://other.example/api" })
    ).rejects.toMatchObject({ retryable: false })
    expect(api.adapter).not.toHaveBeenCalled()
  })
  it("rejects a mutation of exported client defaults", async () => {
    const api = await client()
    api.httpClient.defaults.baseURL = "https://other.example/api"
    await expect(api.request({ url: "/projects" })).rejects.toMatchObject({
      retryable: false,
    })
    expect(api.adapter).not.toHaveBeenCalled()
  })
})
