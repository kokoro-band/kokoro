import { expect, it } from "vite-plus/test"
import { sampleProject } from "./data"
import { validateCloudIntent } from "./cloud-ai"

it("rejects string angles instead of coercing a response outside the cloud schema", () => {
  expect(() =>
    validateCloudIntent(
      {
        action: "ROTATE",
        catalogId: "sofa-cloud",
        placement: null,
        rotation: "90",
        anchorCatalogId: null,
      },
      sampleProject
    )
  ).toThrow()
})
