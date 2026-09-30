import childProcess from "node:child_process"
import { syncBuiltinESMExports } from "node:module"
import process from "node:process"

// Preloaded only by the invalid-CLI test. Even swallowed cleanup calls leave evidence.
function forbidden() {
  process.stderr.write("UNEXPECTED_CHILD_PROCESS\n")
  throw new Error("Invalid E2E options must not invoke external tools")
}
childProcess.spawn = forbidden
childProcess.spawnSync = forbidden
syncBuiltinESMExports()
