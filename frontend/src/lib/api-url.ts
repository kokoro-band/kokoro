/** Keep paths literal so proxies and URL parsers cannot disagree about traversal. */
export function isApiPath(path: unknown): path is string {
  if (typeof path !== "string" || !path.startsWith("/")) return false
  if (path === "/") return true
  const segments = path.replace(/\/$/, "").slice(1).split("/")
  return segments.every(
    (segment) =>
      /^[A-Za-z0-9._~-]+$/.test(segment) && segment !== "." && segment !== ".."
  )
}

/** null defers configuration failure until a request, keeping the editor renderable. */
export function resolveApiBaseUrl(
  configured: string | undefined,
  development: boolean,
  pageProtocol?: string
): string | null {
  const value = configured ?? (development ? "http://localhost:8080/api" : "")
  if (!value || value.length > 2048 || /[\s\\?#]/.test(value)) return null
  if (value.startsWith("/"))
    return isApiPath(value) ? value.replace(/\/$/, "") || "/" : null

  const match = /^(https?):\/\/([^/]+)(\/.*)?$/i.exec(value)
  if (!match || match[2].includes("@") || !isApiPath(match[3] ?? "/"))
    return null
  try {
    const url = new URL(value)
    if (url.username || url.password || !url.hostname) return null
    if (
      url.protocol === "http:" &&
      (!development ||
        pageProtocol === "https:" ||
        !/^(localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i.test(match[2]))
    )
      return null
    return url.href.replace(/\/$/, "")
  } catch {
    return null
  }
}
