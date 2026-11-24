export type AuthSession = { token: string; username: string; expiresAt: number }

const STORAGE_KEY = "kokoro-demo-session-v1"

/** Demo builds ask for a login before the studio opens. */
export const authRequired = import.meta.env.VITE_AUTH_MODE === "demo"

let loaded = false
let session: AuthSession | null = null
const listeners = new Set<() => void>()

function parse(value: unknown): AuthSession | null {
  if (!value || typeof value !== "object") return null
  const { token, username, expiresAt } = value as Record<string, unknown>
  if (
    typeof token !== "string" ||
    typeof username !== "string" ||
    typeof expiresAt !== "number" ||
    !Number.isFinite(expiresAt)
  )
    return null
  return { token, username, expiresAt }
}

function load() {
  if (loaded) return
  loaded = true
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    session = raw ? parse(JSON.parse(raw)) : null
  } catch {
    session = null
  }
}

/** The stored session, or null when it is missing or past its expiry. */
export function currentSession(): AuthSession | null {
  load()
  return session && session.expiresAt > Date.now() ? session : null
}

export function saveSession(next: AuthSession) {
  loaded = true
  session = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Blocked storage: the session still works until the tab closes.
  }
  listeners.forEach((listener) => listener())
}

export function logout() {
  loaded = true
  session = null
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing stored that could outlive the in-memory session.
  }
  listeners.forEach((listener) => listener())
}

export function subscribeSession(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
