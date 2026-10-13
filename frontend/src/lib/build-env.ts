import { resolveApiBaseUrl } from "./api-url"

type BuildEnv = Record<string, string | undefined>

/** Fail in vp dev and vp build so a mistyped env file never ships as a different deployment. */
export function resolveBuildEnv(env: BuildEnv, command: "build" | "serve") {
  const mode = env.VITE_API_MODE || "local"
  if (mode !== "local" && mode !== "server")
    throw new Error("VITE_API_MODE는 local 또는 server만 사용할 수 있어요.")

  const base = env.VITE_BASE_PATH || "/"
  if (!/^\/(?:[A-Za-z0-9._~-]+\/)*$/.test(base))
    throw new Error(
      "VITE_BASE_PATH는 /kokoro/처럼 /로 시작하고 /로 끝나는 경로여야 해요."
    )

  // vp dev falls back to the loopback API. A built site has no such default.
  if (
    command === "build" &&
    mode === "server" &&
    resolveApiBaseUrl(env.VITE_API_BASE_URL, false) === null
  )
    throw new Error(
      "서버 모드 빌드에는 VITE_API_BASE_URL이 필요해요. HTTPS 주소 또는 /api 같은 같은 출처 경로를 설정해 주세요."
    )

  return { base, mode } as const
}
