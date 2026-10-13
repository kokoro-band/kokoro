import { IDBFactory, IDBObjectStore, IDBTransaction } from "fake-indexeddb"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { sampleProject } from "./data"
import type { Project } from "./types"

const key = "kokoro-remodel-project-v1"
const values = new Map<string, string>()
const setItem = vi.fn((key: string, value: string) => values.set(key, value))
const removeItem = vi.fn((key: string) => values.delete(key))
beforeEach(() => {
  values.clear()
  vi.clearAllMocks()
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem,
    removeItem,
  })
  vi.stubGlobal("indexedDB", new IDBFactory())
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})
function project(name = "내 작업"): Project {
  return { ...structuredClone(sampleProject), id: "my-saved-project", name }
}
/** A fresh module graph stands in for a page load against the same browser storage. */
async function openPage() {
  vi.resetModules()
  const store = await import("./local-project-store")
  const api = await import("./project-api")
  await store.hydrateLocalProjectStore()
  return api
}

describe("local project store on IndexedDB", () => {
  it("restores a saved project after reload without writing localStorage", async () => {
    const first = await openPage()
    expect(first.readSavedProjectWithRecovery()).toMatchObject({
      project: { id: sampleProject.id },
      recovery: null,
    })
    const saved = await first.saveProject(project())
    expect(first.readSavedProject()).toEqual(saved)

    const second = await openPage()
    expect(second.readSavedProjectWithRecovery()).toEqual({
      project: saved,
      recovery: null,
    })
    expect(setItem).not.toHaveBeenCalled()
  })

  it("carries a project saved by the localStorage version over and keeps the original", async () => {
    const raw = JSON.stringify(project("예전 작업"))
    values.set(key, raw)
    const first = await openPage()
    expect(first.readSavedProject().name).toBe("예전 작업")
    values.delete(key)

    const second = await openPage()
    expect(second.readSavedProject().name).toBe("예전 작업")
    expect(setItem).not.toHaveBeenCalled()
    expect(removeItem).not.toHaveBeenCalled()
  })

  it("prefers the IndexedDB project over a stale localStorage copy", async () => {
    values.set(key, JSON.stringify(project("예전 작업")))
    const first = await openPage()
    await first.saveProject(project("새 작업"))

    const second = await openPage()
    expect(second.readSavedProject().name).toBe("새 작업")
    expect(JSON.parse(values.get(key)!).name).toBe("예전 작업")
  })

  it("reports an unreadable localStorage original once and then loads the next save", async () => {
    values.set(key, "{")
    const first = await openPage()
    expect(first.readSavedProjectWithRecovery()).toMatchObject({
      project: { id: sampleProject.id },
      recovery: "corrupt",
    })
    await first.saveProject(project())

    const second = await openPage()
    expect(second.readSavedProjectWithRecovery()).toMatchObject({
      project: { id: "my-saved-project" },
      recovery: null,
    })
    expect(values.get(key)).toBe("{")
  })

  it("reports an unreadable IndexedDB record instead of loading it", async () => {
    const first = await openPage()
    await first.saveProject(project())
    // Overwrite the record the app wrote with one the reader must reject.
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open("kokoro")
      open.onsuccess = () => resolve(open.result)
      open.onerror = () => reject(open.error)
    })
    const name = db.objectStoreNames[0]
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(name, "readwrite")
      const store = tx.objectStore(name)
      const keys = store.getAllKeys()
      keys.onsuccess = () =>
        store.put({ ...project(), furniture: [null] }, keys.result[0])
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()

    const second = await openPage()
    expect(second.readSavedProjectWithRecovery()).toMatchObject({
      project: { id: sampleProject.id },
      recovery: "corrupt",
    })
  })

  it("keeps the previous project and explains a full device when the write is refused", async () => {
    const api = await openPage()
    const saved = await api.saveProject(project())
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError")
    })
    await expect(api.saveProject(project("다음 작업"))).rejects.toThrow(
      "저장 공간이 부족"
    )
    vi.restoreAllMocks()
    expect(api.readSavedProject()).toEqual(saved)
    expect((await openPage()).readSavedProject()).toEqual(saved)
    expect(setItem).not.toHaveBeenCalled()
  })

  it("explains a full device when the browser refuses the write after accepting the request", async () => {
    const api = await openPage()
    const saved = await api.saveProject(project())
    // fake-indexeddb has no quota, so fail the queued write the way a browser reports one.
    type Queued = { operation: () => unknown }
    const transactions = IDBTransaction.prototype as unknown as {
      _execRequestAsync: (this: IDBTransaction, queued: Queued) => unknown
    }
    const run = transactions._execRequestAsync
    vi.spyOn(transactions, "_execRequestAsync").mockImplementation(
      function (this: IDBTransaction, queued) {
        if (this.mode === "readwrite")
          queued.operation = () => {
            throw new DOMException("full", "QuotaExceededError")
          }
        return run.call(this, queued)
      }
    )
    await expect(api.saveProject(project("다음 작업"))).rejects.toThrow(
      "저장 공간이 부족"
    )
    vi.restoreAllMocks()
    expect((await openPage()).readSavedProject()).toEqual(saved)
  })

  it("keeps edits saved to localStorage while IndexedDB was unavailable", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    const browser = indexedDB
    vi.setSystemTime("2026-10-13T01:00:00Z")
    await (await openPage()).saveProject(project("첫 작업"))

    vi.stubGlobal("indexedDB", {
      open() {
        throw new DOMException("denied", "SecurityError")
      },
    })
    vi.setSystemTime("2026-10-13T02:00:00Z")
    await (await openPage()).saveProject(project("막힌 동안의 작업"))

    vi.stubGlobal("indexedDB", browser)
    expect((await openPage()).readSavedProject().name).toBe("막힌 동안의 작업")
    values.delete(key)
    expect((await openPage()).readSavedProject().name).toBe("막힌 동안의 작업")
  })

  it("ignores an unreadable localStorage copy once IndexedDB holds a project", async () => {
    await (await openPage()).saveProject(project("첫 작업"))
    values.set(key, "{")
    expect((await openPage()).readSavedProjectWithRecovery()).toMatchObject({
      project: { name: "첫 작업" },
      recovery: null,
    })
    expect(values.get(key)).toBe("{")
  })
})

describe("local project store without IndexedDB", () => {
  it("keeps using localStorage when the browser has no IndexedDB", async () => {
    vi.stubGlobal("indexedDB", undefined)
    values.set(key, JSON.stringify(project("예전 작업")))
    const api = await openPage()
    expect(api.readSavedProject().name).toBe("예전 작업")
    await api.saveProject(project("새 작업"))
    expect(JSON.parse(values.get(key)!).name).toBe("새 작업")
  })

  it("keeps using localStorage when IndexedDB refuses to open", async () => {
    vi.stubGlobal("indexedDB", {
      open() {
        throw new DOMException("denied", "SecurityError")
      },
    })
    values.set(key, JSON.stringify(project("예전 작업")))
    const api = await openPage()
    expect(api.readSavedProject().name).toBe("예전 작업")
    await api.saveProject(project("새 작업"))
    expect(JSON.parse(values.get(key)!).name).toBe("새 작업")
  })

  it("stops waiting for an IndexedDB that never answers so the editor can open", async () => {
    vi.useFakeTimers()
    vi.stubGlobal("indexedDB", { open: () => ({}) })
    values.set(key, JSON.stringify(project("예전 작업")))
    vi.resetModules()
    const store = await import("./local-project-store")
    const api = await import("./project-api")
    let ready = false
    const hydrated = store.hydrateLocalProjectStore().then(() => {
      ready = true
    })
    await vi.advanceTimersByTimeAsync(2999)
    expect(ready).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await hydrated
    expect(api.readSavedProject().name).toBe("예전 작업")
    await api.saveProject(project("새 작업"))
    expect(JSON.parse(values.get(key)!).name).toBe("새 작업")
  })
})
