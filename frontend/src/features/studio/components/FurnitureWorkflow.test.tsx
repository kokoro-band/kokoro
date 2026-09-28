// @vitest-environment happy-dom
import { act, StrictMode, useState } from "react"
import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { SnackbarProvider } from "seed-design/ui/snackbar"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { ArrangeView } from "./ArrangeView"
import { SummaryView } from "./SummaryView"
import { useStudioController } from "../hooks/useStudioController"
import { sampleProject, catalog } from "../data"
import { buildRoomModel } from "../room-builder"
import type { Project } from "../types"

// Only the WebGL scene boundary is replaced. UI, controller and persistence are real.
vi.mock("./SceneEditor", () => ({ SceneEditor: () => <div>3D 경계</div> }))
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
    dimensions: { width: 8, depth: 8, height: 2.4 },
    room: buildRoomModel({ rooms: [{ id: "room", name: "거실", x: 0, z: 0, width: 8, depth: 8 }], wallHeight: 2.4 }),
    furniture: [],
  }
  localStorage.setItem("kokoro-remodel-project-v1", JSON.stringify(project))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  function Harness() {
    const studio = useStudioController()
    const [roomIndex, setRoomIndex] = useState<number | null>(0)
    return <>
      <ArrangeView studio={studio} roomIndex={roomIndex} isMobile={false} onRoomChange={setRoomIndex} onOpenStructure={() => {}} />
      <section aria-label="검증 내역"><SummaryView project={studio.project} onEnterRoom={setRoomIndex} onStartArranging={() => studio.setLeftTab("furniture")} onOpenStructure={() => {}} /></section>
    </>
  }
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  cleanups.push(async () => { await act(async () => root.unmount()); client.clear(); container.remove() })
  await act(async () => root.render(<StrictMode><QueryClientProvider client={client}><SnackbarProvider><Harness /></SnackbarProvider></QueryClientProvider></StrictMode>))
  function button(name: string) {
    const target = [...container.querySelectorAll<HTMLButtonElement>("button")].find((item) => (item.getAttribute("aria-label") ?? item.textContent?.trim()) === name)
    if (!target) throw new Error(`Missing button: ${name}`)
    return target
  }
  function input(name: string) {
    const target = [...container.querySelectorAll<HTMLInputElement>("input")].find((item) => item.getAttribute("aria-label") === name || document.getElementById(item.getAttribute("aria-labelledby") ?? "")?.textContent === name)
    expect(target, `Input ${name} must be available`).toBeDefined()
    return target!
  }
  async function type(name: string, value: string) {
    const target = input(name)
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(target, value)
      target.dispatchEvent(new Event("input", { bubbles: true }))
    })
  }
  async function click(name: string) { await act(async () => button(name).click()) }
  async function key(target: Element, key: string) {
    await act(async () => {
      target.dispatchEvent(new KeyboardEvent("keydown", { key, code: key, bubbles: true, cancelable: true }))
      target.dispatchEvent(new KeyboardEvent("keyup", { key, code: key, bubbles: true }))
    })
  }
  const catalogButtons = () => [...container.querySelectorAll<HTMLButtonElement>('button[aria-label$="에 놓기"]')]
  return { container, button, input, type, click, key, catalogButtons, saved: () => JSON.parse(localStorage.getItem("kokoro-remodel-project-v1")!) as Project }
}

describe("furniture search and real local workflow", () => {
  it("searches by name and category and treats blank input as all results", async () => {
    const ui = await setup()
    expect(ui.catalogButtons()).toHaveLength(catalog.length)
    await ui.type("가구 검색", "  셸  ")
    expect(ui.catalogButtons().map((item) => item.textContent)).toEqual([expect.stringContaining("셸 체어")])
    await ui.type("가구 검색", "의자")
    expect(ui.catalogButtons()).toHaveLength(catalog.filter((item) => item.category === "의자").length)
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
})
