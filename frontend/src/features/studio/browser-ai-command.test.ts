// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vite-plus/test"
import {
  groundBrowserIntent,
  parseBrowserIntent,
  resolveRequestedRotation,
} from "./browser-ai-intent"
import { proposeBrowserIntent } from "./browser-ai-command"
import { sampleProject } from "./data"
import { roomForFurniture } from "./house-navigation"
import { confirmCommand } from "./project-api"

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

it("rejects invalid model output before creating a proposal or changing storage", () => {
  for (const raw of [
    "not JSON",
    '{"action":"ADD","catalogId":"invented","placement":"CENTER"}',
    '{"action":"ADD","catalogId":"chair-shell","placement":"OUTSIDE"}',
    '{"action":"CLEAR","catalogId":"sofa-cloud"}',
  ])
    expect(() => parseBrowserIntent(raw)).toThrow()
  expect(localStorage.length).toBe(0)
})

it("uses the user's explicit angle when the small model returns a different number", () => {
  const raw =
    '<think>\n</think>\n{"action":"ROTATE","catalogId":"chair-shell","placement":"CENTER","rotation":0}'
  const intent = resolveRequestedRotation(
    parseBrowserIntent(raw),
    "의자를 90도 회전해줘"
  )
  expect(intent.rotation).toBe(90)
})

it("binds explicit target and anchor instead of trusting invented model IDs", () => {
  const project = structuredClone(sampleProject)
  const message = "소파 옆에 화분을 놓아줘"
  const modelIntent = parseBrowserIntent(
    '{"action":"ADD","catalogId":"sofa-cloud","placement":"NEAR_TARGET","rotation":90,"anchorCatalogId":"sofa-moss"}'
  )
  const intent = groundBrowserIntent(project, message, modelIntent)
  expect(intent).toMatchObject({
    catalogId: "plant-olive",
    anchorCatalogId: "sofa-cloud",
    placement: "NEAR_TARGET",
    rotation: null,
  })
  const response = proposeBrowserIntent(project, intent)
  expect(response.proposedCommands[0]).toMatchObject({
    type: "ADD",
    catalogId: "plant-olive",
  })
  expect(project.furniture).toHaveLength(4)
  const command = response.proposedCommands[0]
  const proposed = {
    ...project.furniture[0],
    x: command.x!,
    z: command.z!,
  }
  expect(roomForFurniture(project.room!.rooms, proposed)).toBe(
    roomForFurniture(project.room!.rooms, project.furniture[0])
  )
  expect(
    Math.hypot(
      proposed.x - project.furniture[0].x,
      proposed.z - project.furniture[0].z
    )
  ).toBeLessThan(2.5)
})

it("corrects the observed small-model action and string angle before proposing", () => {
  const project = structuredClone(sampleProject)
  const intent = groundBrowserIntent(
    project,
    "소파 옆에 화분을 놓아줘",
    parseBrowserIntent(
      '{"action":"MOVE","catalogId":"sofa-cloud","placement":"LEFT","rotation":"90","anchorCatalogId":"sofa-cloud"}'
    )
  )
  expect(intent).toMatchObject({
    action: "ADD",
    catalogId: "plant-olive",
    placement: "NEAR_TARGET",
    anchorCatalogId: "sofa-cloud",
    rotation: null,
  })
  expect(
    proposeBrowserIntent(project, intent).proposedCommands[0]
  ).toMatchObject({
    type: "ADD",
    catalogId: "plant-olive",
  })
})

it("keeps an explicit window placement when the model chooses another place", () => {
  const intent = groundBrowserIntent(
    structuredClone(sampleProject),
    "창가에 의자를 옮겨줘",
    parseBrowserIntent(
      '{"action":"MOVE","catalogId":"chair-sand","placement":"LEFT"}'
    )
  )
  expect(intent).toMatchObject({
    action: "MOVE",
    catalogId: "chair-shell",
    placement: "NEAR_WINDOW",
  })
})

it("previews a browser AI addition and saves only after confirmation", async () => {
  const project = { ...structuredClone(sampleProject), furniture: [] }
  const intent = parseBrowserIntent(
    '{"action":"ADD","catalogId":"chair-shell","placement":"CENTER"}'
  )
  const response = proposeBrowserIntent(project, intent)
  expect(response.requiresConfirmation).toBe(true)
  expect(response.project.furniture).toEqual([])
  expect(response.proposedCommands[0]).toMatchObject({
    type: "ADD",
    catalogId: "chair-shell",
  })
  expect(localStorage.length).toBe(0)
  const saved = await confirmCommand(project, response.proposalId!)
  expect(saved.project.furniture).toHaveLength(1)
  expect(saved.project.furniture[0].catalogId).toBe("chair-shell")
})

it("asks the user to choose among matching existing furniture", () => {
  const one = { ...sampleProject.furniture[2], id: "chair-a" }
  const two = { ...one, id: "chair-b", x: one.x + 1 }
  const project = { ...structuredClone(sampleProject), furniture: [one, two] }
  const intent = parseBrowserIntent(
    '{"action":"REMOVE","catalogId":"chair-shell"}'
  )
  const response = proposeBrowserIntent(project, intent)
  expect(response.candidates.map((item) => item.furnitureId)).toEqual([
    "chair-a",
    "chair-b",
  ])
  expect(response.project.furniture).toEqual(project.furniture)
  expect(localStorage.length).toBe(0)
})

it("keeps furniture unchanged for unsupported or missing targets", () => {
  const project = structuredClone(sampleProject)
  expect(() =>
    proposeBrowserIntent(
      project,
      parseBrowserIntent('{"action":"UNSUPPORTED"}')
    )
  ).toThrow()
  expect(() =>
    proposeBrowserIntent(
      project,
      parseBrowserIntent('{"action":"REMOVE","catalogId":"chair-sand"}')
    )
  ).toThrow()
  expect(project.furniture).toEqual(sampleProject.furniture)
  expect(localStorage.length).toBe(0)
})
