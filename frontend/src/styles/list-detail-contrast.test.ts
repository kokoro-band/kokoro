import { readFileSync } from "node:fs"
import { describe, expect, it } from "vite-plus/test"

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8")
const seed = read("../../node_modules/@seed-design/css/base.css")
const foundation = read("./foundation.css")

/** First definition wins: SEED lists the light theme before the dark one. */
function lightValue(token: string): string {
  const value = new RegExp(`${token}:\\s*([^;]+);`).exec(seed)?.[1].trim()
  if (!value) throw new Error(`Missing SEED token ${token}`)
  const alias = /^var\((--[\w-]+)\)$/.exec(value)?.[1]
  return alias ? lightValue(alias) : value
}

function luminance(color: string) {
  // #abc is shorthand for #aabbcc.
  const hex =
    color.length === 4 ? `#${color.slice(1).replace(/./g, "$&$&")}` : color
  const [r, g, b] = [1, 3, 5].map((at) => {
    const channel = Number.parseInt(hex.slice(at, at + 2), 16) / 255
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

describe("list detail text", () => {
  it("uses a foreground token that reaches 4.5:1 on the panel background", () => {
    const rule =
      /\.seed-list-item__detail[^{]*\{[^}]*color:\s*var\((--seed-color-[\w-]+)\)/.exec(
        foundation
      )
    expect(rule, "list detail colour override").not.toBeNull()
    const text = lightValue(rule![1])
    const panel = lightValue("--seed-color-bg-layer-default")
    expect(contrast(text, panel)).toBeGreaterThanOrEqual(4.5)
  })

  it("documents why the SEED default is not enough", () => {
    // SEED's own detail colour: about 3.4:1 on white.
    expect(
      contrast(lightValue("--seed-color-fg-neutral-subtle"), "#ffffff")
    ).toBeLessThan(4.5)
  })
})
