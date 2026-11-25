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
    "frontend only (non-AI)",
    ["frontend/src/App.tsx"],
    { frontend: true, backend: false, localAi: false, ollama: false },
  ],
  [
    "backend only (non-AI)",
    ["backend/src/main/java/com/kokoro/room/floorplan/FloorPlanStorage.java"],
    { frontend: false, backend: true, localAi: false, ollama: false },
  ],
  [
    "browser AI frontend file",
    ["frontend/src/features/studio/browser-ai.worker.ts"],
    { frontend: true, backend: false, localAi: true, ollama: false },
  ],
  [
    "local AI E2E spec",
    ["frontend/e2e/local-ai/browser-ai.spec.ts"],
    { frontend: true, backend: false, localAi: true, ollama: false },
  ],
  [
    "Ollama E2E spec",
    ["frontend/e2e/ollama.spec.ts"],
    { frontend: true, backend: false, localAi: false, ollama: true },
  ],
  [
    "shared AI assistant frontend file",
    ["frontend/src/features/studio/local-ai.ts"],
    { frontend: true, backend: false, localAi: true, ollama: true },
  ],
  [
    "backend layout-intent AI file",
    ["backend/src/main/java/com/kokoro/room/project/LocalLayoutIntent.java"],
    { frontend: false, backend: true, localAi: false, ollama: true },
  ],
  [
    "contract fixture",
    ["docs/contracts/fixtures/room-v2.json"],
    { frontend: true, backend: true, localAi: true, ollama: true },
  ],
  [
    "workflow",
    [".github/workflows/ci.yml"],
    { frontend: true, backend: true, localAi: true, ollama: true },
  ],
  [
    "filter itself",
    [".github/scripts/ci-changes.mjs"],
    { frontend: true, backend: true, localAi: true, ollama: true },
  ],
  [
    "runtime",
    ["flake.lock"],
    { frontend: true, backend: true, localAi: true, ollama: true },
  ],
  [
    "prose only",
    ["README.md", "docs/architecture.md"],
    { frontend: false, backend: false, localAi: false, ollama: false },
  ],
  [
    "unusual filename",
    ["frontend/src/a\nfile.ts"],
    { frontend: true, backend: false, localAi: false, ollama: false },
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
  needsLocalAi: "true",
  needsOllama: "true",
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
  assert.throws(() => assertResults({ ...result, needsLocalAi: "" }))
  assert.throws(() => assertResults({ ...result, needsOllama: "" }))
})

for (const job of ["e2e", "localAiE2e", "ollamaE2e"]) {
  for (const status of ["failure", "cancelled", "skipped"]) {
    test(`required ${job} ${status} fails the aggregate`, () => {
      assert.throws(() => assertResults({ ...result, [job]: status }))
    })
  }
}
test("non-AI frontend changes allow both AI E2E jobs to skip while requiring server E2E", () => {
  const nonAiFrontend = {
    ...result,
    localAiE2e: "skipped",
    ollamaE2e: "skipped",
    needsLocalAi: "false",
    needsOllama: "false",
  }
  assert.doesNotThrow(() => assertResults(nonAiFrontend))
  assert.throws(() => assertResults({ ...nonAiFrontend, e2e: "skipped" }))
})
test("non-AI backend changes require server E2E but allow both AI E2E jobs to skip", () => {
  const backendOnly = {
    ...result,
    frontend: "skipped",
    backend: "success",
    localAiE2e: "skipped",
    ollamaE2e: "skipped",
    needsFrontend: "false",
    needsBackend: "true",
    needsLocalAi: "false",
    needsOllama: "false",
  }
  assert.doesNotThrow(() => assertResults(backendOnly))
  assert.throws(() => assertResults({ ...backendOnly, e2e: "skipped" }))
})
test("prose changes allow all E2E jobs to skip", () => {
  assert.doesNotThrow(() =>
    assertResults({
      ...result,
      frontend: "skipped",
      e2e: "skipped",
      localAiE2e: "skipped",
      ollamaE2e: "skipped",
      needsFrontend: "false",
      needsLocalAi: "false",
      needsOllama: "false",
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
  assert.match(
    workflow,
    /local-ai-e2e:[\s\S]*?if: needs\.changes\.outputs\.local_ai == 'true'/
  )
  assert.match(
    workflow,
    /ollama-e2e:[\s\S]*?if: needs\.changes\.outputs\.ollama == 'true'/
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
    assert.equal(
      readFileSync(output, "utf8"),
      "frontend=true\nbackend=false\nlocal_ai=true\nollama=true\n"
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
