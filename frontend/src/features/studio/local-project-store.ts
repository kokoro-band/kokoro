import {
  maxStoredProjectLength,
  parseStoredProject,
} from "./project-validation"
import type { Project } from "./types"

const legacyKey = "kokoro-remodel-project-v1"
const databaseName = "kokoro"
const storeName = "projects"
const recordKey = "current"
const OPEN_TIMEOUT_MS = 3000

// Null until hydration succeeds. localStorage stays the store for that page load.
let database: IDBDatabase | null = null
let record: { value: unknown } | null = null

function settled<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    let waiting = true
    const fail = (error: unknown) => {
      waiting = false
      clearTimeout(timer)
      reject(error)
    }
    // Some browsers never answer when storage is blocked. The editor must still open.
    const timer = setTimeout(
      () => fail(new Error("IndexedDB did not open")),
      OPEN_TIMEOUT_MS
    )
    const request = indexedDB.open(databaseName, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(storeName)
    request.onblocked = request.onerror = () => fail(request.error)
    request.onsuccess = () => {
      if (!waiting) return request.result.close()
      clearTimeout(timer)
      resolve(request.result)
    }
  })
}

function put(target: IDBDatabase, value: unknown) {
  return new Promise<void>((resolve, reject) => {
    const transaction = target.transaction(storeName, "readwrite")
    const request = transaction.objectStore(storeName).put(value, recordKey)
    transaction.oncomplete = () => resolve()
    // The transaction has no error yet when the request fails, so keep the request's.
    transaction.onabort = () =>
      reject(
        transaction.error ??
          request.error ??
          new Error("IndexedDB write failed")
      )
  })
}

function valid(value: unknown): Project | null {
  try {
    return parseStoredProject(value)
  } catch {
    return null
  }
}

function legacyProject(): { value: unknown } | null {
  let raw: string | null
  try {
    raw = localStorage.getItem(legacyKey)
  } catch {
    return null
  }
  if (raw === null) return null
  try {
    if (raw.length > maxStoredProjectLength)
      throw new Error("Project too large")
    return { value: JSON.parse(raw) }
  } catch {
    // An unreadable original is reported by the reader and left where it is.
    return { value: undefined }
  }
}

/**
 * Call once before the first render in local mode. Never rejects.
 * A project saved by the localStorage version is copied over, not moved.
 */
export async function hydrateLocalProjectStore(): Promise<void> {
  try {
    if (typeof indexedDB === "undefined") return
    const opened = await openDatabase()
    const value: unknown = await settled(
      opened.transaction(storeName).objectStore(storeName).get(recordKey)
    )
    const legacy = legacyProject()
    const copy = legacy && valid(legacy.value)
    if (value === undefined) {
      record = legacy
      // Skip the copy when the original is invalid. Saving writes a valid record later.
      if (copy) await put(opened, copy)
    } else {
      record = { value }
      // A visit that could not open IndexedDB saved to localStorage instead. Keep those edits.
      const stored = valid(value)
      if (
        copy &&
        stored &&
        Date.parse(copy.updatedAt) > Date.parse(stored.updatedAt)
      ) {
        await put(opened, copy)
        record = { value: copy }
      }
    }
    database = opened
  } catch {
    database = null
    record = null
  }
}

/** undefined means IndexedDB is not in use and the caller reads localStorage. */
export function hydratedLocalProject(): { value: unknown } | null | undefined {
  return database ? record : undefined
}

/** Resolves false when IndexedDB is not in use and the caller writes localStorage. */
export async function writeLocalProject(project: Project): Promise<boolean> {
  if (!database) return false
  await put(database, project)
  record = { value: structuredClone(project) }
  return true
}
