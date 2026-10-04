import process from "node:process"
import { waitUntil } from "./runtime.mjs"

export class ProcessGroups {
  groups = new Set()
  constructor(
    kill = (pid, signal) => {
      process.kill(-pid, signal)
    }
  ) {
    this.kill = kill
  }
  track(pid) {
    if (pid) this.groups.add(pid)
  }
  // A wrapper can exit before its server/browser descendants. Probe the whole group.
  leaderExited(pid) {
    this.signal(pid, 0)
  }
  signal(pid, signal) {
    try {
      this.kill(pid, signal)
    } catch (error) {
      // A denied existence probe does not prove the group has disappeared.
      // macOS can briefly return EPERM while a signalled group exits. Keep it
      // tracked and probe again; denied termination signals still fail cleanup.
      if (signal === 0 && error.code === "EPERM") return
      if (error.code !== "ESRCH") throw error
      this.groups.delete(pid)
    }
  }
  async stop(graceMs = 5000) {
    const exited = async () => {
      for (const pid of this.groups) this.signal(pid, 0)
      return this.groups.size === 0
    }
    for (const pid of this.groups) this.signal(pid, "SIGTERM")
    await waitUntil(exited, { timeoutMs: graceMs }).catch(() => {})
    for (const pid of this.groups) this.signal(pid, "SIGKILL")
    await waitUntil(exited, { timeoutMs: 3000 })
  }
}
