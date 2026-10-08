import assert from "node:assert/strict"
import { test } from "node:test"
import {
  readFileSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { execFileSync } from "node:child_process"
import { assertResults, changedAreas } from "./ci-changes.mjs"

for (const [name, paths, expected] of [
  [
    "frontend only",
    ["frontend/src/App.tsx"],
    { frontend: true, backend: false },
  ],
  ["backend only", ["backend/pom.xml"], { frontend: false, backend: true }],
  [
    "contract fixture",
    ["docs/contracts/fixtures/room-v2.json"],
    { frontend: true, backend: true },
  ],
  ["workflow", [".github/workflows/ci.yml"], { frontend: true, backend: true }],
  [
    "filter itself",
    [".github/scripts/ci-changes.mjs"],
    { frontend: true, backend: true },
  ],
  ["runtime", ["flake.lock"], { frontend: true, backend: true }],
  [
    "prose only",
    ["README.md", "docs/architecture.md"],
    { frontend: false, backend: false },
  ],
  [
    "unusual filename",
    ["frontend/src/a\nfile.ts"],
    { frontend: true, backend: false },
  ],
]) {
  test(name, () => assert.deepEqual(changedAreas(paths), expected))
}

const result = {
  changes: "success",
  frontend: "success",
  backend: "skipped",
  e2e: "success",
  localAiE2e: "success",
  ollamaE2e: "success",
  needsFrontend: "true",
  needsBackend: "false",
}
test("only an unnecessary skipped job passes", () =>
  assert.doesNotThrow(() => assertResults(result)))
for (const status of ["failure", "cancelled", "skipped"]) {
  test(`required ${status} fails`, () =>
    assert.throws(() => assertResults({ ...result, frontend: status })))
}
test("failed detection fails even when builds were skipped", () => {
  assert.throws(() =>
    assertResults({ ...result, changes: "failure", frontend: "skipped" })
  )
})
test("missing filter output is not treated as unnecessary", () => {
  assert.throws(() => assertResults({ ...result, needsFrontend: "" }))
})

for (const job of ["e2e", "localAiE2e", "ollamaE2e"]) {
  for (const status of ["failure", "cancelled", "skipped"]) {
    test(`required ${job} ${status} fails the aggregate`, () => {
      assert.throws(() => assertResults({ ...result, [job]: status }))
    })
  }
}
test("backend changes require server E2E but allow local AI E2E to skip", () => {
  const backendOnly = {
    ...result,
    frontend: "skipped",
    backend: "success",
    localAiE2e: "skipped",
    needsFrontend: "false",
    needsBackend: "true",
  }
  assert.doesNotThrow(() => assertResults(backendOnly))
  assert.throws(() => assertResults({ ...backendOnly, e2e: "skipped" }))
})
test("prose changes allow both E2E jobs to skip", () => {
  assert.doesNotThrow(() =>
    assertResults({
      ...result,
      frontend: "skipped",
      e2e: "skipped",
      localAiE2e: "skipped",
      needsFrontend: "false",
    })
  )
})
test("new PR runs cancel previous runs while main keeps every commit's artifacts", () => {
  const workflow = readFileSync(
    new URL("../workflows/ci.yml", import.meta.url),
    "utf8"
  )
  assert.match(
    workflow,
    /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/
  )
  assert.match(
    workflow,
    /group: ci-\$\{\{ github\.workflow \}\}-\$\{\{ github\.event_name == 'pull_request' && github\.ref \|\| github\.run_id \}\}/
  )
})

test("moving a frontend file into documentation still requires frontend checks", () => {
  const directory = mkdtempSync(join(tmpdir(), "kokoro-ci-rename-"))
  const env = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
  }
  const git = (...args) =>
    execFileSync("git", args, { cwd: directory, env, encoding: "utf8" }).trim()
  try {
    git("init", "-q", "--initial-branch=main")
    mkdirSync(join(directory, "frontend"))
    mkdirSync(join(directory, "docs"))
    writeFileSync(
      join(directory, "frontend/package.json"),
      '{"name":"fixture"}\n'
    )
    git("add", ".")
    git(
      "-c",
      "user.name=CI Test",
      "-c",
      "user.email=ci@example.invalid",
      "commit",
      "-qm",
      "before"
    )
    const base = git("rev-parse", "HEAD")
    git("mv", "frontend/package.json", "docs/archive-package.json")
    git(
      "-c",
      "user.name=CI Test",
      "-c",
      "user.email=ci@example.invalid",
      "commit",
      "-qm",
      "after"
    )
    const output = join(directory, "github-output")
    execFileSync(
      process.execPath,
      [fileURLToPath(new URL("./ci-changes.mjs", import.meta.url))],
      {
        cwd: directory,
        env: {
          ...env,
          BASE_SHA: base,
          HEAD_SHA: git("rev-parse", "HEAD"),
          GITHUB_OUTPUT: output,
        },
      }
    )
    assert.equal(readFileSync(output, "utf8"), "frontend=true\nbackend=false\n")
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
