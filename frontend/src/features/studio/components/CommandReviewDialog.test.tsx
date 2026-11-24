// @vitest-environment happy-dom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { CommandReviewDialog } from "./CommandReviewDialog"
import { commandLayoutKey } from "../command-review"
import { sampleProject } from "../data"
import { makeFurniture } from "../project-api"
import { buildRoomModel } from "../room-builder"
import type { CommandResponse, CommandReview, Project } from "../types"

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  vi.unstubAllGlobals()
})

const sofa = makeFurniture("sofa-cloud", 2, 4)
const chair = makeFurniture("chair-shell", 7, 3)
const project: Project = {
  ...structuredClone(sampleProject),
  dimensions: { width: 9.6, depth: 6.9, height: 2.4 },
  room: buildRoomModel({
    rooms: [
      { id: "a", name: "거실", x: 0, z: 0, width: 4.8, depth: 6.9 },
      { id: "b", name: "침실", x: 4.8, z: 0, width: 4.8, depth: 6.9 },
    ],
    wallHeight: 2.4,
  }),
  furniture: [sofa, chair],
}

function render(
  response: Partial<CommandResponse>,
  review: Partial<CommandReview> = {},
  onChoose: (furnitureId: string) => void = () => {}
) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  cleanups.push(() => {
    act(() => root.unmount())
    container.remove()
  })
  act(() =>
    root.render(
      <CommandReviewDialog
        review={{
          response: {
            reply: "",
            project,
            appliedActions: [],
            commands: [],
            requiresConfirmation: false,
            proposalId: null,
            expiresAt: null,
            proposedCommands: [],
            candidates: [],
            ...response,
          },
          message: "요청",
          baseKey: commandLayoutKey(project),
          status: "ready",
          error: "",
          ...review,
        }}
        project={project}
        onCancel={() => {}}
        onConfirm={() => {}}
        onChoose={onChoose}
        onRequestAgain={() => {}}
      />
    )
  )
  return document.body.textContent ?? ""
}

describe("command review dialog", () => {
  it("names the room of every proposed change", () => {
    const text = render({
      requiresConfirmation: true,
      proposalId: "p",
      expiresAt: new Date().toISOString(),
      proposedCommands: [
        { type: "REMOVE", furnitureId: sofa.id },
        {
          type: "ADD",
          catalogId: "plant-olive",
          furnitureId: "new",
          x: 8,
          z: 5,
        },
      ],
    })
    expect(text).toContain("거실 · 클라우드 소파 삭제")
    expect(text).toContain("침실 · 올리브 화분 추가")
  })

  it("names the room of each candidate", () => {
    const text = render({
      candidates: [
        { furnitureId: sofa.id, name: sofa.name },
        { furnitureId: chair.id, name: chair.name },
      ],
    })
    expect(text).toContain(`1. 거실 · ${sofa.name}`)
    expect(text).toContain(`2. 침실 · ${chair.name}`)
  })

  it("selects a pending ADD candidate without changing the base project", () => {
    const baseProject = structuredClone(project)
    const onChoose = vi.fn()
    const text = render(
      {
        candidates: [
          { furnitureId: chair.id, name: chair.name },
          { furnitureId: "future-a", name: "쉘 체어" },
          { furnitureId: "future-b", name: "쉘 체어" },
        ],
      },
      {
        localIntent: {
          version: 1,
          intents: [
            { type: "ADD", catalogId: "chair-shell", count: 2 },
            { type: "ROTATE", targetQuery: "의자", rotation: 90 },
          ],
        },
      },
      onChoose
    )
    expect(text).toContain(`1. 침실 · ${chair.name} (7, 3 m)`)
    const pending = Array.from(document.querySelectorAll("button")).filter(
      (button) => /^(2|3)\./.test(button.textContent ?? "")
    )
    expect(pending.map((button) => button.textContent)).toEqual([
      "2. 쉘 체어 (추가 예정)",
      "3. 쉘 체어 (추가 예정)",
    ])
    expect(pending.every((button) => !button.disabled)).toBe(true)
    act(() => pending[1].click())
    expect(onChoose).toHaveBeenCalledExactlyOnceWith("future-b")
    expect(project).toEqual(baseProject)
  })

  it.each<Partial<CommandReview>>([
    {},
    { status: "applying" },
    { status: "stale" },
    { baseKey: "outdated" },
  ])("keeps unavailable candidates disabled for review %j", (review) => {
    const onChoose = vi.fn()
    render(
      { candidates: [{ furnitureId: "future-a", name: "쉘 체어" }] },
      {
        ...(Object.keys(review).length > 0 && {
          localIntent: {
            version: 1,
            intents: [{ type: "ADD", catalogId: "chair-shell", count: 2 }],
          },
        }),
        ...review,
      },
      onChoose
    )
    const candidate = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent?.startsWith("1. 쉘 체어")
    )!
    expect(candidate.disabled).toBe(true)
    act(() => candidate.click())
    expect(onChoose).not.toHaveBeenCalled()
  })
})
