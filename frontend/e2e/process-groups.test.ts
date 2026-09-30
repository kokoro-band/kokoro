import { afterEach, expect, it, vi } from "vite-plus/test"
import { ProcessGroups } from "./process-groups.mjs"

afterEach(() => vi.useRealTimers())

it("cleans remaining descendants even when their leader already exited", async () => {
  const living = new Set([42])
  const kill = vi.fn((pid: number, signal: string | number) => {
    if (!living.has(pid))
      throw Object.assign(new Error("gone"), { code: "ESRCH" })
    if (signal === "SIGKILL") living.delete(pid)
  })
  const groups = new ProcessGroups(kill)
  groups.track(42)
  groups.leaderExited(42)
  await groups.stop(0)
  expect(living.size).toBe(0)
  expect(kill).toHaveBeenCalledWith(42, "SIGKILL")
})

it("waits for killed groups to actually exit instead of treating a signal as completion", async () => {
  vi.useFakeTimers()
  let alive = true
  const kill = vi.fn((_pid: number, signal: string | number) => {
    if (!alive) throw Object.assign(new Error("gone"), { code: "ESRCH" })
    if (signal === "SIGKILL")
      setTimeout(() => {
        alive = false
      }, 200)
  })
  const groups = new ProcessGroups(kill)
  groups.track(43)
  const done = vi.fn()
  const stopping = groups.stop(0).then(done)
  await vi.advanceTimersByTimeAsync(0)
  expect(done).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(500)
  await stopping
  expect(alive).toBe(false)
  expect(done).toHaveBeenCalledOnce()
})
