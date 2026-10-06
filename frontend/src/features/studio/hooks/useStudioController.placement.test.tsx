// @vitest-environment happy-dom
import { act, createRef, useImperativeHandle, type Ref } from "react"
import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { useStudioController } from "./useStudioController"
import { sampleProject } from "../data"
import { placementIssues } from "../placement-issues"
import type { Project } from "../types"

type Studio = ReturnType<typeof useStudioController>
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
})
async function setup() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  const project: Project = {
    ...sampleProject,
    dimensions: { width: 6, depth: 6, height: 2.4 },
    room: {
      version: 2,
      unit: "m",
      wallHeight: 2.4,
      bounds: { width: 6, depth: 6 },
      outline: [
        [0, 0],
        [6, 0],
        [6, 6],
        [0, 6],
      ],
      walls: [{ id: "divider", a: [3, 0], b: [3, 6], thickness: 0.2 }],
      openings: [],
      rooms: [],
    },
    furniture: [
      {
        id: "chair",
        catalogId: "chair-shell",
        name: "의자",
        category: "의자",
        x: 1,
        z: 2,
        rotation: 0,
        color: "#000",
      },
    ],
  }
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

describe("manual placement controller", () => {
  it("saves a wall-safe drag and keeps one undo entry even when dragging against the wall repeatedly", async () => {
    const studio = await setup()
    await act(async () => {
      studio().moveFurniture("chair", 5, 2)
      for (let i = 0; i < 10; i++) studio().moveFurniture("chair", 5, 2)
      studio().commitPreview()
    })
    expect(studio().project.furniture[0].x).toBeCloseTo(2.575, 5)
    const saved = JSON.parse(
      localStorage.getItem("kokoro-remodel-project-v1")!
    ) as Project
    expect(saved.furniture[0].x).toBeCloseTo(2.575, 5)
    expect(placementIssues(saved)).toEqual([])
    await act(async () => studio().undo())
    expect(studio().project.furniture[0].x).toBe(1)
    expect(studio().canUndo).toBe(false)
    await act(async () => studio().redo())
    expect(studio().project.furniture[0].x).toBeCloseTo(2.575, 5)
  })
  it("constrains inspector, keyboard and rotation edits through the same controller", async () => {
    const studio = await setup()
    await act(async () => studio().selectFurniture("chair"))
    await act(async () => studio().updateSelected({ x: 5 }))
    expect(studio().selected?.x).toBeCloseTo(2.575, 5)
    await act(async () => {
      expect(studio().previewSelected({ x: 6 })).toBe(false)
      studio().commitPreview()
    })
    await act(async () => studio().updateSelected({ rotation: 45 }))
    expect(studio().selected?.rotation).toBe(0)
    expect(placementIssues(studio().project)).toEqual([])
  })
  it("works out a held VR pose against the walls without touching the project", async () => {
    const studio = await setup()
    const chair = studio().project.furniture[0]
    const pose = studio().constrainPose(chair, { x: 5 })
    expect(pose.x).toBeCloseTo(2.575, 5)
    const turned = studio().constrainPose(pose, { rotation: 45 })
    expect(
      placementIssues({ ...studio().project, furniture: [turned] })
    ).toEqual([])
    expect(studio().project.furniture[0]).toBe(chair)
    expect(studio().dirty).toBe(false)
    expect(studio().canUndo).toBe(false)
  })
  it("saves a released VR grab as one undo entry", async () => {
    const studio = await setup()
    await act(async () => {
      expect(
        studio().placeFurniture("chair", { x: 1.5, z: 2.5, rotation: 30 })
      ).toBe(true)
      studio().commitPreview()
    })
    expect(studio().project.furniture[0]).toMatchObject({
      x: 1.5,
      z: 2.5,
      rotation: 30,
    })
    const saved = JSON.parse(
      localStorage.getItem("kokoro-remodel-project-v1")!
    ) as Project
    expect(saved.furniture[0]).toMatchObject({ x: 1.5, z: 2.5, rotation: 30 })
    await act(async () => studio().undo())
    expect(studio().project.furniture[0]).toMatchObject({
      x: 1,
      z: 2,
      rotation: 0,
    })
    expect(studio().canUndo).toBe(false)
  })
  it("never saves a released VR pose inside a wall", async () => {
    const studio = await setup()
    await act(async () => {
      studio().placeFurniture("chair", { x: 3, z: 2, rotation: 0 })
      studio().commitPreview()
    })
    expect(placementIssues(studio().project)).toEqual([])
  })
  it("places a newly added item outside the wall", async () => {
    const studio = await setup()
    await act(async () => studio().addFurniture("chair-shell", [3, 4]))
    expect(studio().project.furniture).toHaveLength(2)
    expect(placementIssues(studio().project)).toEqual([])
  })
})
