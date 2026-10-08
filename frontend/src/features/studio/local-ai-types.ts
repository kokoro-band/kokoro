export type LocalLayoutRelation = "NEAR" | "FAR_FROM"

export type LocalLayoutIntentItem =
  | {
      type: "ADD"
      catalogId: string
      count?: number
      anchorQuery?: string
      relation?: LocalLayoutRelation
    }
  | {
      type: "MOVE"
      targetQuery: string
      anchorQuery?: string
      relation?: LocalLayoutRelation
    }
  | { type: "ROTATE"; targetQuery: string; rotation: number }
  | { type: "REMOVE"; targetQuery: string }
  | { type: "CLEAR" }

export type LocalLayoutIntent = {
  version: 1
  intents: LocalLayoutIntentItem[]
}
