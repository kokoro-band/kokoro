import assert from "node:assert/strict"
import { test } from "node:test"
import { assertResults, changedAreas } from "./ci-changes.mjs"

for (const [name, paths, expected] of [
  ["frontend only", ["frontend/src/App.tsx"], { frontend: true, backend: false }],
  ["backend only", ["backend/pom.xml"], { frontend: false, backend: true }],
  ["contract fixture", ["docs/contracts/fixtures/room-v2.json"], { frontend: true, backend: true }],
  ["workflow", [".github/workflows/ci.yml"], { frontend: true, backend: true }],
  ["filter itself", [".github/scripts/ci-changes.mjs"], { frontend: true, backend: true }],
  ["runtime", ["flake.lock"], { frontend: true, backend: true }],
  ["prose only", ["README.md", "docs/architecture.md"], { frontend: false, backend: false }],
  ["unusual filename", ["frontend/src/a\nfile.ts"], { frontend: true, backend: false }],
]) {
  test(name, () => assert.deepEqual(changedAreas(paths), expected))
}

const result = { changes: "success", frontend: "success", backend: "skipped", needsFrontend: "true", needsBackend: "false" }
test("only an unnecessary skipped job passes", () => assert.doesNotThrow(() => assertResults(result)))
for (const status of ["failure", "cancelled", "skipped"]) {
  test(`required ${status} fails`, () => assert.throws(() => assertResults({ ...result, frontend: status })))
}
test("failed detection fails even when builds were skipped", () => {
  assert.throws(() => assertResults({ ...result, changes: "failure", frontend: "skipped" }))
})
test("missing filter output is not treated as unnecessary", () => {
  assert.throws(() => assertResults({ ...result, needsFrontend: "" }))
})
