import { describe, expect, it } from "vite-plus/test"
import { resolveBuildEnv } from "./build-env"

describe("build environment", () => {
  it("defaults to the local demo at the site root", () => {
    expect(resolveBuildEnv({}, "build")).toEqual({ base: "/", mode: "local" })
  })

  it("reads the deployment path and server mode from env files", () => {
    expect(
      resolveBuildEnv(
        {
          VITE_API_MODE: "server",
          VITE_API_BASE_URL: "https://api.example.test/api",
          VITE_BASE_PATH: "/kokoro/",
        },
        "build"
      )
    ).toEqual({ base: "/kokoro/", mode: "server" })
  })

  it.each(["Server", "sever", "remote", " server"])(
    "refuses the unknown mode %j instead of quietly building the local demo",
    (mode) => {
      expect(() => resolveBuildEnv({ VITE_API_MODE: mode }, "build")).toThrow(
        "VITE_API_MODE"
      )
      expect(() => resolveBuildEnv({ VITE_API_MODE: mode }, "serve")).toThrow(
        "VITE_API_MODE"
      )
    }
  )

  it.each([
    undefined,
    "",
    "http://localhost:8080/api",
    "http://api.example.test/api",
    "https://api.example.test/api?token=secret",
  ])("refuses a server build whose API address is %j", (url) => {
    const env = {
      VITE_API_MODE: "server",
      ...(url === undefined ? {} : { VITE_API_BASE_URL: url }),
    }
    expect(() => resolveBuildEnv(env, "build")).toThrow("VITE_API_BASE_URL")
  })

  it("does not echo the configured address in the failure", () => {
    let message = ""
    try {
      resolveBuildEnv(
        {
          VITE_API_MODE: "server",
          VITE_API_BASE_URL: "https://user:secret@api.example.test/api",
        },
        "build"
      )
    } catch (error) {
      message = String(error)
    }
    expect(message).toContain("VITE_API_BASE_URL")
    expect(message).not.toContain("secret")
  })

  it("lets vp dev start in server mode without an address", () => {
    expect(resolveBuildEnv({ VITE_API_MODE: "server" }, "serve").mode).toBe(
      "server"
    )
  })

  it.each(["/api", "https://api.example.test/api"])(
    "accepts %s for a server build",
    (url) => {
      expect(
        resolveBuildEnv(
          { VITE_API_MODE: "server", VITE_API_BASE_URL: url },
          "build"
        ).mode
      ).toBe("server")
    }
  )

  it.each(["kokoro/", "/kokoro", "https://example.test/kokoro/", "//x/"])(
    "refuses the deployment path %j",
    (base) => {
      expect(() => resolveBuildEnv({ VITE_BASE_PATH: base }, "build")).toThrow(
        "VITE_BASE_PATH"
      )
    }
  )
})
