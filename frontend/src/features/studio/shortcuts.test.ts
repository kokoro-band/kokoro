import { describe, expect, it } from "vite-plus/test"

import {
  formatCombo,
  shortcutCombos,
  shortcuts,
  shortcutText,
  type ShortcutId,
} from "./shortcuts"

describe("shortcuts", () => {
  it("shows the platform modifier for mod", () => {
    expect(shortcutText("redo", true)).toBe("⌘⇧Z")
    expect(shortcutText("redo", false)).toBe("Ctrl+Shift+Z")
    expect(shortcutCombos("redo", false)).toEqual([
      ["Ctrl", "Shift", "Z"],
      ["Ctrl", "Y"],
    ])
  })

  it("shows the typed character for shifted symbol keys", () => {
    expect(shortcutText("guide", false)).toBe("?")
    expect(formatCombo(["slash"], false)).toEqual(["/"])
    expect(formatCombo(["shift", "arrowup"], true)).toEqual(["⇧", "↑"])
  })

  it("does not bind the same keys twice in one screen", () => {
    const seen = new Map<string, ShortcutId>()
    for (const [id, shortcut] of Object.entries(shortcuts)) {
      for (const combo of shortcut.keys) {
        // 어디서나 쓰는 키는 구조와 배치 화면의 키와도 겹치면 안 됩니다.
        const groups =
          shortcut.group === "app" ? ["structure", "arrange"] : [shortcut.group]
        for (const group of groups) {
          const key = `${group}:${combo}`
          expect(seen.get(key), `${id} ${combo}`).toBeUndefined()
          seen.set(key, id as ShortcutId)
        }
      }
    }
  })
})
