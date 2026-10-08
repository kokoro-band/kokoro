// @vitest-environment happy-dom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { CommandReviewDialog } from "./CommandReviewDialog"
import { commandLayoutKey } from "../command-review"
import { sampleProject } from "../data"
import { makeFurniture } from "../project-api"
import { buildRoomModel } from "../room-builder"
import type { CommandResponse, Project } from "../types"

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

function render(response: Partial<CommandResponse>) {
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
        }}
        project={project}
        onCancel={() => {}}
        onConfirm={() => {}}
        onChoose={() => {}}
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
})
