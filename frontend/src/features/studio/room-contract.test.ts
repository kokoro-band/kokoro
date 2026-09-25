import { describe, expect, it } from "vite-plus/test"

import fixtureSource from "../../../../docs/contracts/fixtures/room-v2.json?raw"

import { addOpening, buildRoomModel, type RoomDraft } from "./room-builder"
import type { RoomModel } from "./types"

const fixture = JSON.parse(fixtureSource) as {
  draft: RoomDraft
  room: RoomModel
}

describe("shared room JSON contract", () => {
  it("generates the same concave room consumed by the Spring API test", () => {
    let room = buildRoomModel(fixture.draft)
    room = addOpening(room, room.walls[0].id, "door", 1)
    room = addOpening(room, room.walls[1].id, "window", 1)

    expect(JSON.parse(JSON.stringify(room))).toEqual(fixture.room)
  })
})
