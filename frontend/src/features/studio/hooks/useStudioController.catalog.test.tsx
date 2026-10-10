// @vitest-environment happy-dom
import { act, createRef, useImperativeHandle, type Ref } from "react"
import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { useStudioController } from "./useStudioController"
import { sampleProject } from "../data"
import { roomCenter } from "../house-navigation"
import { placementIssues } from "../placement-issues"
import { buildRoomModel } from "../room-builder"
import type { Project } from "../types"

type Studio = ReturnType<typeof useStudioController>
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
})
async function setup(project: Project) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  localStorage.setItem("kokoro-remodel-project-v1", JSON.stringify(project))
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const ref = createRef<Studio>()
  function Harness({ controllerRef }: { controllerRef: Ref<Studio> }) {
    const studio = useStudioController()
    useImperativeHandle(controllerRef, () => studio)
    return null
  }
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <Harness controllerRef={ref} />
      </QueryClientProvider>
    )
  )
  cleanups.push(async () => {
    await act(async () => root.unmount())
    client.clear()
    container.remove()
  })
  return () => ref.current!
}

describe("adding furniture from the catalogue", () => {
  it("puts every catalogue item on free floor in the sample living room", async () => {
    const project = { ...structuredClone(sampleProject), id: "catalog-test" }
    const living = project.room!.rooms.find((room) => room.name === "거실")!
    const studio = await setup(project)
    for (const catalogId of ["sofa-cloud", "chair-shell", "plant-olive"]) {
      const before = studio().project.furniture.length
      await act(async () =>
        studio().addFurniture(catalogId, roomCenter(living), living)
      )
      // The room fills up; whatever was added must not need repair.
      expect(placementIssues(studio().project)).toEqual([])
      if (studio().project.furniture.length === before)
        expect(studio().notice?.tone).toBe("critical")
    }
    expect(studio().project.furniture.length).toBeGreaterThan(4)
  })

  it("tells the user instead of stacking furniture when the room has no free floor", async () => {
    const room = buildRoomModel({
      rooms: [
        { id: "a", name: "거실", x: 0, z: 0, width: 5, depth: 4 },
        { id: "b", name: "창고", x: 5, z: 0, width: 1, depth: 1 },
      ],
      wallHeight: 2.4,
    })
    const storage = room.rooms.find((entry) => entry.name === "창고")!
    const [x, z] = roomCenter(storage)
    const chair = {
      id: "chair",
      catalogId: "chair-shell",
      name: "셸 체어",
      category: "의자" as const,
      x,
      z,
      rotation: 0,
      color: "#000000",
    }
    const studio = await setup({
      ...structuredClone(sampleProject),
      id: "catalog-full",
      dimensions: { width: 6, depth: 4, height: 2.4 },
      room,
      furniture: [chair],
    })
    expect(placementIssues(studio().project)).toEqual([])
    await act(async () =>
      studio().addFurniture("chair-shell", roomCenter(storage), storage)
    )
    expect(studio().project.furniture).toEqual([chair])
    expect(studio().notice).toMatchObject({
      tone: "critical",
      text: "다른 가구나 문 앞을 피해서 놓을 자리가 없어요. 자리를 비운 뒤 다시 놓아 주세요.",
    })
    expect(studio().selectedId).toBeNull()
  })
})
