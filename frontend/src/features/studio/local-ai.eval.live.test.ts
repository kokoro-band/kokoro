/// <reference types="node" />
import { readFileSync, writeFileSync } from "node:fs"
import process from "node:process"

import { describe, expect, it } from "vite-plus/test"

import { catalog } from "./data"
import {
  LocalAiError,
  localAiModel,
  requestLocalLayoutIntent,
} from "./local-ai"

// #61: runs the Korean command dataset through the same client and prompt as the app.
// Requires `ollama serve` and `ollama pull qwen3:4b`. Run with KOKORO_LIVE_AI_EVAL=1.
const datasetPath = new URL(
  "../../../../docs/ai/korean-layout-command-eval.json",
  import.meta.url
)
const resultPath = new URL(
  "../../../../docs/ai/qwen3-4b-results.json",
  import.meta.url
)

type Expected = { type: string; target: string | null }
type Row = {
  id: string
  split: "dev" | "eval"
  category: string
  input: string
  expectedIntents: Expected[]
  expectedRequiresConfirmation: boolean
  expectedRejection: boolean
}
type Intent = { type: string; catalogId?: string; targetQuery?: string }
type Measured = {
  id: string
  split: Row["split"]
  category: string
  input: string
  expected: string
  actual: string
  raw: Intent[]
  matched: boolean
  wrongProposal: boolean
  jsonValid: boolean
  ms: number
}

const families: [string, RegExp][] = [
  ["sofa", /소파/],
  ["table", /테이블|책상|탁자/],
  ["chair", /의자|체어/],
  ["plant", /화분|식물/],
  ["lamp", /램프|조명|스탠드/],
]

function family(intent: Intent): string | null {
  if (intent.catalogId) return intent.catalogId.split("-")[0]
  const query = intent.targetQuery ?? ""
  return families.find(([, pattern]) => pattern.test(query))?.[0] ?? null
}

function describeIntents(intents: Intent[]) {
  return `[${intents.map((intent) => `${intent.type}${family(intent) ? `:${family(intent)}` : ""}`).join(", ")}]`
}

function percentile(values: number[], p: number) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[
    Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  ]
}

describe.runIf(process.env.KOKORO_LIVE_AI_EVAL === "1")(
  "qwen3:4b command eval",
  () => {
    it(
      "records results for every dataset row",
      async () => {
        const dataset = JSON.parse(readFileSync(datasetPath, "utf8")) as {
          version: number
          items: Row[]
        }
        const rows: Measured[] = []
        for (const row of dataset.items) {
          const started = performance.now()
          let intents: Intent[] = []
          let error: string | null = null
          try {
            intents = (await requestLocalLayoutIntent(row.input, { catalog }))
              .intents as Intent[]
          } catch (caught) {
            if (!(caught instanceof LocalAiError)) throw caught
            error = caught.kind
          }
          const ms = Math.round(performance.now() - started)
          // Every model proposal still needs the user's confirmation in the app; CLEAR is also marked by the server.
          const requiresConfirmation = intents.some(
            (intent) => intent.type === "CLEAR"
          )
          const matched = row.expectedRejection
            ? intents.length === 0
            : intents.length === row.expectedIntents.length &&
              requiresConfirmation === row.expectedRequiresConfirmation &&
              row.expectedIntents.every(
                (expected, index) =>
                  intents[index].type === expected.type &&
                  (expected.target === null ||
                    family(intents[index]) === expected.target)
              )
          rows.push({
            id: row.id,
            split: row.split,
            category: row.category,
            input: row.input,
            expected: row.expectedRejection
              ? "거절 또는 되묻기"
              : describeIntents(
                  row.expectedIntents.map((e) => ({
                    type: e.type,
                    catalogId: e.target ? `${e.target}-x` : undefined,
                  }))
                ),
            actual: error ? `오류(${error})` : describeIntents(intents),
            raw: intents,
            matched,
            // A proposal for a row that should be refused. It is shown for confirmation, not applied.
            wrongProposal: row.expectedRejection && intents.length > 0,
            jsonValid: error !== "invalid-response",
            ms,
          })
        }

        const summarize = (subset: typeof rows) => {
          const times = subset.map((row) => row.ms)
          return {
            total: subset.length,
            intentMatch: subset.filter((row) => row.matched).length,
            intentMatchRate:
              Math.round(
                (1000 * subset.filter((row) => row.matched).length) /
                  subset.length
              ) / 10,
            jsonValidRate:
              Math.round(
                (1000 * subset.filter((row) => row.jsonValid).length) /
                  subset.length
              ) / 10,
            wrongProposal: subset.filter((row) => row.wrongProposal).length,
            medianMs: percentile(times, 50),
            p95Ms: percentile(times, 95),
            maxMs: Math.max(...times),
          }
        }
        const group = (key: "split" | "category") =>
          Object.fromEntries(
            [...new Set(rows.map((row) => row[key]))].map((value) => [
              value,
              summarize(rows.filter((row) => row[key] === value)),
            ])
          )
        const result = {
          model: localAiModel,
          datasetVersion: dataset.version,
          environment: process.env.KOKORO_EVAL_ENVIRONMENT ?? null,
          bySplit: group("split"),
          byCategory: group("category"),
          failures: rows
            .filter((row) => !row.matched)
            .map(({ id, split, input, expected, actual }) => ({
              id,
              split,
              input,
              expected,
              actual,
            })),
          rows: rows.map(({ id, split, actual, matched, jsonValid, ms }) => ({
            id,
            split,
            actual,
            matched,
            jsonValid,
            ms,
          })),
        }
        writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`)
        expect(rows).toHaveLength(dataset.items.length)
      },
      100 * 60_000
    )
  }
)
