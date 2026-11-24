import { describe, expect, it } from "vite-plus/test"

import { catalog, furnitureSize, sampleProject } from "./data"
import { placementIssues } from "./placement-issues"
import { assertFurnitureWrite, parseStoredProject } from "./project-validation"
import type { Furniture, FurnitureSize, Project } from "./types"

// 서버 CustomSizeFurnitureTest와 같은 좌표와 경계를 씁니다.
const fridge = (x: number, z: number, size?: FurnitureSize): Furniture => ({
  id: "fridge",
  catalogId: "custom-box",
  name: "냉장고",
  category: "기타",
  x,
  z,
  rotation: 0,
  color: "#F2F2F2",
  ...(size ? { size } : {}),
})
const chair = (x: number, z: number): Furniture => ({
  id: "chair",
  catalogId: "chair-shell",
  name: "의자",
  category: "의자",
  x,
  z,
  rotation: 0,
  color: "#000000",
})
const project = (furniture: Furniture[]): Project => ({
  ...structuredClone(sampleProject),
  dimensions: { width: 6, depth: 5, height: 2.4 },
  room: undefined,
  furniture,
})

describe("크기를 직접 가진 가구", () => {
  it("자기 크기로 다른 가구와 겹침을 판정한다", () => {
    const wide = fridge(2, 2.5, { width: 2, depth: 0.5, height: 1 })
    expect(placementIssues(project([wide, chair(3.2, 2.5)]))).toEqual([
      { furnitureId: "fridge", reason: "다른 가구와 겹쳐 있어요." },
      { furnitureId: "chair", reason: "다른 가구와 겹쳐 있어요." },
    ])
    const narrow = fridge(2, 2.5, { width: 0.5, depth: 0.55, height: 1.05 })
    expect(placementIssues(project([narrow, chair(3.2, 2.5)]))).toEqual([])
  })

  it("자기 크기로 방 밖을 판정한다", () => {
    const nearWall = fridge(5.6, 2.5, { width: 1, depth: 0.5, height: 1 })
    expect(placementIssues(project([nearWall]))[0].reason).toContain("경계")
  })

  it("크기는 직접 가진 값을, 카탈로그 가구는 카탈로그 값을 쓴다", () => {
    const size = { width: 0.5, depth: 0.55, height: 1.05 }
    expect(furnitureSize(fridge(0, 0, size))).toEqual(size)
    const shell = catalog.find((item) => item.id === "chair-shell")!
    expect(furnitureSize(chair(0, 0))).toMatchObject({
      width: shell.width,
      depth: shell.depth,
    })
    expect(furnitureSize(fridge(0, 0))).toBeUndefined()
  })

  it("저장한 프로젝트를 다시 읽어도 크기와 기타 종류가 남는다", () => {
    const size = { width: 0.5, depth: 0.55, height: 1.05 }
    const read = parseStoredProject(project([fridge(1, 1, size), chair(3, 3)]))
    expect(read.furniture[0]).toMatchObject({ category: "기타", size })
    expect(read.furniture[1]).not.toHaveProperty("size")
  })

  it("서버가 보낸 size: null은 크기 없음으로 읽는다", () => {
    const read = parseStoredProject(
      project([{ ...chair(3, 3), size: null } as unknown as Furniture])
    )
    expect(read.furniture[0]).not.toHaveProperty("size")
  })

  const bad: [string, Furniture][] = [
    ["직접 추가한 가구에 크기가 없음", fridge(1, 1)],
    [
      "카탈로그 가구에 크기가 있음",
      { ...chair(1, 1), size: { width: 3, depth: 3, height: 3 } },
    ],
    ["0.05m 미만", fridge(1, 1, { width: 0.04, depth: 0.5, height: 1 })],
    ["5m 초과", fridge(1, 1, { width: 0.5, depth: 5.01, height: 1 })],
    ["유한하지 않음", fridge(1, 1, { width: 0.5, depth: 0.5, height: NaN })],
    [
      "변이 빠짐",
      fridge(1, 1, { width: 0.5, height: 1 } as unknown as FurnitureSize),
    ],
  ]

  it.each(bad)("%s: 읽기와 쓰기 모두 거부한다", (_, item) => {
    expect(() => parseStoredProject(project([item]))).toThrow()
    expect(() => assertFurnitureWrite([item])).toThrow()
  })

  it("0.05m와 5m 경계는 받는다", () => {
    const item = fridge(1, 1, { width: 0.05, depth: 5, height: 0.05 })
    expect(() => assertFurnitureWrite([item])).not.toThrow()
    expect(parseStoredProject(project([item])).furniture[0].size).toEqual(
      item.size
    )
  })
})

describe("크기를 직접 가진 가구의 3D 모양", () => {
  it("입력한 가로·세로·높이 그대로 바닥에 놓인 상자로 그린다", async () => {
    const THREE = await import("three")
    const { makeFallbackModel } = await import("./furniture-fallback")
    const model = makeFallbackModel(
      fridge(2, 2, { width: 0.5, depth: 0.55, height: 1.05 })
    )
    const bounds = new THREE.Box3().setFromObject(model)
    const size = bounds.getSize(new THREE.Vector3())
    expect(size.x).toBeCloseTo(0.5)
    expect(size.z).toBeCloseTo(0.55)
    expect(size.y).toBeCloseTo(1.05)
    expect(bounds.min.y).toBeCloseTo(0)
  })
})
