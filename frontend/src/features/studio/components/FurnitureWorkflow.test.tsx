// @vitest-environment happy-dom
import {
  act,
  createRef,
  StrictMode,
  useImperativeHandle,
  useState,
} from "react"
import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { SnackbarProvider } from "seed-design/ui/snackbar"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { ArrangeView } from "./ArrangeView"
import { SummaryView } from "./SummaryView"
import { useStudioController } from "../hooks/useStudioController"
import { sampleProject, catalog } from "../data"
import { buildRoomModel } from "../room-builder"
import type { Furniture, Project } from "../types"

// Only the WebGL scene boundary is replaced. UI, controller and persistence are real.
vi.mock("./SceneEditor", () => ({ SceneEditor: () => <div>3D 경계</div> }))
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
})

async function setup(overrides: Partial<Project> = {}, isMobile = false) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  const project: Project = {
    ...sampleProject,
    dimensions: { width: 8, depth: 8, height: 2.4 },
    room: buildRoomModel({
      rooms: [{ id: "room", name: "거실", x: 0, z: 0, width: 8, depth: 8 }],
      wallHeight: 2.4,
    }),
    furniture: [],
    ...overrides,
  }
  localStorage.setItem("kokoro-remodel-project-v1", JSON.stringify(project))
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const controller = createRef<ReturnType<typeof useStudioController>>()
  function Harness() {
    const studio = useStudioController()
    useImperativeHandle(controller, () => studio)
    const [roomIndex, setRoomIndex] = useState<number | null>(0)
    return (
      <>
        <ArrangeView
          studio={studio}
          roomIndex={roomIndex}
          isMobile={isMobile}
          onRoomChange={setRoomIndex}
          onOpenStructure={() => {}}
        />
        <section aria-label="검증 내역">
          <SummaryView
            project={studio.project}
            onEnterRoom={setRoomIndex}
            onStartArranging={() => studio.setLeftTab("furniture")}
            onOpenStructure={() => {}}
          />
        </section>
      </>
    )
  }
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  cleanups.push(async () => {
    await act(async () => root.unmount())
    client.clear()
    container.remove()
  })
  await act(async () =>
    root.render(
      <StrictMode>
        <QueryClientProvider client={client}>
          <SnackbarProvider>
            <Harness />
          </SnackbarProvider>
        </QueryClientProvider>
      </StrictMode>
    )
  )
  function button(name: string) {
    const target = [
      ...document.querySelectorAll<HTMLButtonElement>(
        'button,[role="menuitem"]'
      ),
    ].find(
      (item) =>
        (item.getAttribute("aria-label") ?? item.textContent?.trim()) === name
    )
    if (!target) throw new Error(`Missing button: ${name}`)
    return target
  }
  function input(name: string) {
    const target = [
      ...container.querySelectorAll<HTMLInputElement>("input"),
    ].find(
      (item) =>
        item.getAttribute("aria-label") === name ||
        document.getElementById(item.getAttribute("aria-labelledby") ?? "")
          ?.textContent === name
    )
    expect(target, `Input ${name} must be available`).toBeDefined()
    return target!
  }
  async function type(name: string, value: string) {
    const target = input(name)
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!.call(target, value)
      target.dispatchEvent(new Event("input", { bubbles: true }))
    })
  }
  async function click(name: string) {
    await act(async () => button(name).click())
  }
  async function key(target: Element, key: string) {
    await act(async () => {
      target.dispatchEvent(
        new KeyboardEvent("keydown", {
          key,
          code: key,
          bubbles: true,
          cancelable: true,
        })
      )
      target.dispatchEvent(
        new KeyboardEvent("keyup", { key, code: key, bubbles: true })
      )
    })
  }
  const catalogButtons = () => [
    ...container.querySelectorAll<HTMLButtonElement>(
      'button[aria-label$="에 놓기"]'
    ),
  ]
  return {
    container,
    button,
    input,
    type,
    click,
    key,
    catalogButtons,
    controller,
    summary: () => container.querySelector('[aria-label="검증 내역"]')!,
    saved: () =>
      JSON.parse(localStorage.getItem("kokoro-remodel-project-v1")!) as Project,
  }
}

describe("furniture search and real local workflow", () => {
  it("searches by name and category and treats blank input as all results", async () => {
    const ui = await setup()
    expect(ui.catalogButtons()).toHaveLength(catalog.length)
    await ui.type("가구 검색", "  셸  ")
    expect(ui.catalogButtons().map((item) => item.textContent)).toEqual([
      expect.stringContaining("셸 체어"),
    ])
    await ui.type("가구 검색", "의자")
    expect(ui.catalogButtons()).toHaveLength(
      catalog.filter((item) => item.category === "의자").length
    )
    await ui.type("가구 검색", "  ")
    expect(ui.catalogButtons()).toHaveLength(catalog.length)
    expect(ui.saved().furniture).toEqual([])
  })

  it("combines category and query and recovers from empty results", async () => {
    const ui = await setup()
    await ui.type("가구 검색", "소파")
    await ui.click("의자")
    expect(ui.catalogButtons()).toHaveLength(0)
    expect(ui.container.textContent).toContain("조건에 맞는 가구가 없어요")
    await ui.click("필터 초기화")
    expect(ui.input("가구 검색").value).toBe("")
    expect(ui.catalogButtons()).toHaveLength(catalog.length)
  })

  it("normalizes decomposed Korean search and leaves the current category active", async () => {
    const ui = await setup()
    await ui.click("의자")
    await ui.type("가구 검색", "셸".normalize("NFD"))
    expect(ui.catalogButtons()).toHaveLength(1)
    await ui.type("가구 검색", "")
    expect(ui.catalogButtons()).toHaveLength(2)
    expect(ui.button("의자").getAttribute("aria-selected")).toBe("true")
  })

  it("adds the search result, selects it and saves edits while rejecting invalid input", async () => {
    const ui = await setup()
    await ui.type("가구 검색", "셸")
    await ui.click("셸 체어 거실에 놓기")
    expect(ui.saved().furniture).toHaveLength(1)
    expect(
      ui.container.querySelector(".inspector-identity")?.textContent
    ).toContain("셸 체어")
    const originalX = ui.saved().furniture[0].x
    await ui.type("가로", "abc")
    await ui.key(ui.input("가로"), "Enter")
    expect(ui.saved().furniture[0].x).toBe(originalX)
    await ui.type("가로", "2.0")
    await ui.key(ui.input("가로"), "Enter")
    expect(ui.saved().furniture[0].x).toBe(2)
    expect(ui.summary().textContent).toContain("₩185,000")
    expect(ui.summary().textContent).toContain("가구 1개")
  })

  it("places consecutive catalog additions on free floor instead of stacking them", async () => {
    const ui = await setup()
    await ui.click("클라우드 소파 거실에 놓기")
    await ui.click("셸 체어 거실에 놓기")
    const [sofa, chair] = ui.saved().furniture
    expect([chair.x, chair.z]).not.toEqual([sofa.x, sofa.z])
    expect(ui.container.textContent).not.toContain("다른 가구와 겹쳐 있어요")
  })

  it("commits keyboard rotation and restores it with one undo", async () => {
    const ui = await setup()
    await ui.click("셸 체어 거실에 놓기")
    const slider = ui.container.querySelector('[role="slider"]')!
    await ui.key(slider, "ArrowRight")
    expect(ui.saved().furniture[0].rotation).toBe(15)
    await act(async () => ui.controller.current!.undo())
    expect(ui.saved().furniture).toHaveLength(1)
    expect(ui.saved().furniture[0].rotation).toBe(0)
    await act(async () => ui.controller.current!.redo())
    expect(ui.saved().furniture[0].rotation).toBe(15)
  })

  it("updates fixed example totals after deletion and recovers from the empty state", async () => {
    const ui = await setup()
    await ui.click("셸 체어 거실에 놓기")
    await ui.click("가구 추가")
    await ui.click("올리브 화분 거실에 놓기")
    expect(ui.summary().textContent).toContain("₩253,000")
    expect(ui.summary().textContent).toContain("가구 2개")
    await ui.click("가구 빼기")
    expect(ui.saved().furniture).toHaveLength(1)
    expect(ui.summary().textContent).toContain("₩185,000")
    await ui.click("배치한 가구 1")
    const placed = ui.container.querySelector<HTMLButtonElement>(
      "[data-furniture-id]"
    )!
    await act(async () => placed.click())
    expect(placed.getAttribute("aria-pressed")).toBe("true")
    await ui.click("가구 빼기")
    expect(ui.saved().furniture).toEqual([])
    expect(ui.summary().textContent).toContain("아직 놓은 가구가 없어요")
    await ui.click("가구 놓으러 가기")
    expect(ui.catalogButtons()).toHaveLength(catalog.length)
  })

  it("does not delete furniture while typing in the search field", async () => {
    const ui = await setup()
    await ui.click("셸 체어 거실에 놓기")
    await ui.click("가구 추가")
    const before = ui.saved().furniture
    await ui.key(ui.input("가구 검색"), "Delete")
    await ui.type("가구 검색", "123")
    expect(ui.saved().furniture).toEqual(before)
  })
})

describe("moving furniture between rooms", () => {
  const twoRooms = (bedroomWidth = 4.8, bedroomDepth = 6.9) => ({
    dimensions: { width: 4.8 + bedroomWidth, depth: 6.9, height: 2.4 },
    room: buildRoomModel({
      rooms: [
        { id: "a", name: "거실", x: 0, z: 0, width: 4.8, depth: 6.9 },
        {
          id: "b",
          name: "침실",
          x: 4.8,
          z: 0,
          width: bedroomWidth,
          depth: bedroomDepth,
        },
      ],
      wallHeight: 2.4,
    }),
  })
  const chair: Furniture = {
    id: "chair-1",
    catalogId: "chair-shell",
    name: "셸 체어",
    category: "의자",
    x: 2,
    z: 3,
    rotation: 90,
    color: "#000000",
  }

  it("moves the selected furniture into another room keeping its identity", async () => {
    const ui = await setup({ ...twoRooms(), furniture: [chair] })
    await act(async () => ui.controller.current!.selectFurniture(chair.id))
    await ui.click("다른 방으로 옮기기")
    await ui.click("침실")
    const [moved] = ui.saved().furniture
    expect(moved).toMatchObject({ id: chair.id, rotation: 90 })
    expect(moved.x).toBeGreaterThan(4.8)
    expect(
      ui.container.querySelector(".inspector-identity")?.textContent
    ).toContain("셸 체어")
    expect(ui.controller.current!.notice?.text).toBe(
      "셸 체어를 침실로 옮겼어요."
    )
  })

  it("exposes destination rooms to assistive technology inside the mobile sheet", async () => {
    const ui = await setup({ ...twoRooms(), furniture: [chair] }, true)
    await act(async () => ui.controller.current!.selectFurniture(chair.id))
    await ui.click("선택한 가구")
    await ui.click("다른 방으로 옮기기")
    const destination = [
      ...document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ].find((item) => item.textContent?.trim() === "침실")
    expect(destination, "침실 menu item").toBeDefined()
    expect(destination!.closest('[aria-hidden="true"]')).toBeNull()
    expect(destination!.closest(".mobile-sheet")).not.toBeNull()
  })

  it("keeps the layout when the destination has no room for it", async () => {
    const sofa: Furniture = { ...chair, id: "sofa-1", catalogId: "sofa-cloud" }
    const ui = await setup({ ...twoRooms(1, 1), furniture: [sofa] })
    await act(async () => ui.controller.current!.selectFurniture(sofa.id))
    await ui.click("다른 방으로 옮기기")
    await ui.click("침실")
    expect(ui.saved().furniture).toEqual([sofa])
    expect(ui.controller.current!.notice?.text).toBe(
      "침실에는 이 가구를 놓을 자리가 없어요."
    )
  })
})
