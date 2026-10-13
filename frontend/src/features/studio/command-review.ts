import type { Project } from "./types"

export class CommandReviewExpiredError extends Error {
  constructor() {
    super("배치가 바뀌었거나 제안이 만료됐어요. 다시 요청해 주세요.")
  }
}

/** Only editable geometry invalidates a preview, not upload progress or UI selection. */
export function commandLayoutKey(project: Project) {
  return JSON.stringify([
    project.id,
    project.dimensions,
    project.room,
    project.furniture,
  ])
}
