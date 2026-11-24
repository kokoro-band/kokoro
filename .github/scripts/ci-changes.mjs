import { execFileSync } from "node:child_process"
import { appendFileSync } from "node:fs"
import { pathToFileURL } from "node:url"

const SHARED_AI_FRONTEND_PATHS = new Set([
  "frontend/package.json",
  "frontend/pnpm-lock.yaml",
  "frontend/vite.config.ts",
  "frontend/src/features/studio/command-review.ts",
  "frontend/src/features/studio/components/AssistantPanel.tsx",
  "frontend/src/features/studio/components/CommandReviewDialog.tsx",
  "frontend/src/features/studio/hooks/useStudioController.local-ai.test.tsx",
  "frontend/e2e/process-groups.mjs",
])

const LOCAL_AI_EXACT_PATHS = new Set([
  "frontend/e2e/run-local-ai.mjs",
  "frontend/playwright.local-ai.config.ts",
])

const OLLAMA_EXACT_PATHS = new Set([
  "frontend/e2e/ollama.spec.ts",
  "frontend/e2e/run.mjs",
  "frontend/e2e/runtime.mjs",
  "frontend/e2e/helpers.ts",
  "frontend/playwright.ollama.config.ts",
  "backend/pom.xml",
  "backend/src/main/java/com/kokoro/room/project/LocalLayoutIntent.java",
  "backend/src/main/java/com/kokoro/room/project/LayoutIntentException.java",
  "backend/src/main/java/com/kokoro/room/project/LayoutProposalRepository.java",
  "backend/src/main/java/com/kokoro/room/project/LayoutCommandInterpreter.java",
  "backend/src/main/java/com/kokoro/room/project/RuleBasedLayoutCommandInterpreter.java",
  "backend/src/main/java/com/kokoro/room/project/AnchorQuery.java",
  "backend/src/main/java/com/kokoro/room/project/RelativePlacementPlanner.java",
  "backend/src/test/java/com/kokoro/room/LayoutIntentApiTest.java",
  "backend/src/test/java/com/kokoro/room/RelativePlacementPlannerTest.java",
])

export function changedAreas(paths) {
  let frontend = false
  let backend = false
  let localAi = false
  let ollama = false
  for (const path of paths) {
    if (
      path.startsWith("docs/contracts/") ||
      path.startsWith(".github/workflows/") ||
      path.startsWith(".github/scripts/") ||
      [
        "flake.nix",
        "flake.lock",
        ".envrc",
        ".tool-versions",
        "AGENTS.md",
      ].includes(path)
    ) {
      frontend = true
      backend = true
      localAi = true
      ollama = true
    }
    if (path.startsWith("frontend/")) frontend = true
    if (path.startsWith("backend/")) backend = true
    if (
      SHARED_AI_FRONTEND_PATHS.has(path) ||
      path.startsWith("frontend/src/features/studio/local-ai")
    ) {
      localAi = true
      ollama = true
    }
    if (
      LOCAL_AI_EXACT_PATHS.has(path) ||
      path.startsWith("frontend/src/features/studio/browser-ai") ||
      path.startsWith("frontend/e2e/local-ai/")
    ) {
      localAi = true
    }
    if (OLLAMA_EXACT_PATHS.has(path)) {
      ollama = true
    }
  }
  return { frontend, backend, localAi, ollama }
}

export function assertResults({
  changes,
  frontend,
  backend,
  e2e,
  localAiE2e,
  ollamaE2e,
  needsFrontend,
  needsBackend,
  needsLocalAi,
  needsOllama,
}) {
  if (changes !== "success") throw new Error("변경 경로 판별에 실패했습니다.")
  for (const [name, needed, result] of [
    ["frontend", needsFrontend, frontend],
    ["backend", needsBackend, backend],
    ["e2e", String(needsFrontend === "true" || needsBackend === "true"), e2e],
    ["local-ai-e2e", needsLocalAi, localAiE2e],
    ["ollama-e2e", needsOllama, ollamaE2e],
  ]) {
    if (needed !== "true" && needed !== "false")
      throw new Error(`${name} 실행 조건이 없습니다.`)
    if (
      needed === "true"
        ? result !== "success"
        : !["success", "skipped"].includes(result)
    ) {
      throw new Error(`${name} 검사 결과가 ${result}입니다.`)
    }
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const { BASE_SHA, HEAD_SHA, GITHUB_OUTPUT } = process.env
  if (
    !/^[a-f0-9]{40}$/.test(HEAD_SHA ?? "") ||
    !/^[a-f0-9]{40}$/.test(BASE_SHA ?? "")
  ) {
    throw new Error("비교할 커밋 SHA가 올바르지 않습니다.")
  }
  const args = /^0+$/.test(BASE_SHA)
    ? ["ls-tree", "-r", "--name-only", "-z", HEAD_SHA]
    : ["diff", "--no-renames", "--name-only", "-z", BASE_SHA, HEAD_SHA, "--"]
  const paths = execFileSync("git", args, { encoding: "utf8" })
    .split("\0")
    .filter(Boolean)
  const result = changedAreas(paths)
  if (!GITHUB_OUTPUT) throw new Error("GITHUB_OUTPUT 경로가 없습니다.")
  appendFileSync(
    GITHUB_OUTPUT,
    `frontend=${result.frontend}\nbackend=${result.backend}\nlocal_ai=${result.localAi}\nollama=${result.ollama}\n`
  )
  console.log(JSON.stringify(result))
}
