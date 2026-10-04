/**
 * 코코로의 모든 키보드 단축키를 한곳에 모읍니다. `useShortcut`은 여기의 키로
 * 동작을 연결하고 단축키 안내는 같은 목록을 그대로 보여 주므로 둘이 어긋나지 않습니다.
 *
 * 키는 react-hotkeys-hook 형식이며 `event.code`로 맞춥니다. 그래서 한글 입력기가
 * 켜져 있어도 같은 자리의 키가 눌립니다. `mod`는 Mac에서 ⌘, 그 밖에서 Ctrl입니다.
 */

export type ShortcutGroup = "app" | "structure" | "arrange"

export type Shortcut = {
  /** 같은 동작을 부르는 키 조합들 */
  keys: string[]
  label: string
  group: ShortcutGroup
  /** 안내에 보여 줄 키 조합. 없으면 `keys`를 그대로 보여 줍니다. */
  display?: string[][]
  /** 누르고 있을 때 반복해서 실행합니다. */
  repeat?: boolean
}

const arrows = ["arrowup", "arrowdown", "arrowleft", "arrowright"]

export const shortcuts = {
  guide: { keys: ["shift+slash"], label: "단축키 보기", group: "app" },
  viewStructure: { keys: ["alt+1"], label: "구조 화면", group: "app" },
  viewArrange: { keys: ["alt+2"], label: "배치 화면", group: "app" },
  viewSummary: { keys: ["alt+3"], label: "내역 화면", group: "app" },
  save: { keys: ["mod+s"], label: "지금 저장", group: "app" },
  undo: { keys: ["mod+z"], label: "실행 취소", group: "app", repeat: true },
  redo: {
    keys: ["mod+shift+z", "mod+y"],
    label: "다시 실행",
    group: "app",
    repeat: true,
  },

  toolSelect: { keys: ["m"], label: "이동 도구", group: "structure" },
  toolSplit: { keys: ["x"], label: "나누기 도구", group: "structure" },
  toolErase: { keys: ["e"], label: "합치기 도구", group: "structure" },
  toolOpening: { keys: ["o"], label: "문·창 도구", group: "structure" },
  toolOption: {
    keys: ["a"],
    label: "나누는 방향이나 문·창 바꾸기",
    group: "structure",
  },
  addRoom: { keys: ["n"], label: "방 추가", group: "structure" },
  deleteRoom: {
    keys: ["delete", "backspace"],
    label: "선택한 방 삭제",
    group: "structure",
  },
  structureEscape: {
    keys: ["escape"],
    label: "이동 도구로 돌아가기, 선택 풀기",
    group: "structure",
  },

  toggleDimension: { keys: ["v"], label: "2D와 3D 바꾸기", group: "arrange" },
  cursorSelect: { keys: ["1"], label: "선택 도구", group: "arrange" },
  cursorMove: { keys: ["2"], label: "가구 이동 도구", group: "arrange" },
  cursorPan: { keys: ["3"], label: "화면 이동 도구", group: "arrange" },
  fullscreen: { keys: ["f"], label: "전체 화면", group: "arrange" },
  previousRoom: {
    keys: ["bracketleft"],
    label: "이전 방",
    group: "arrange",
  },
  nextRoom: { keys: ["bracketright"], label: "다음 방", group: "arrange" },
  focusAssistant: {
    keys: ["slash"],
    label: "AI 배치에 요청 쓰기",
    group: "arrange",
  },
  nudge: {
    keys: arrows,
    display: [arrows],
    label: "선택한 가구 0.1 m 옮기기",
    group: "arrange",
    repeat: true,
  },
  nudgeFar: {
    keys: arrows.map((key) => `shift+${key}`),
    display: [["shift", ...arrows]],
    label: "선택한 가구 0.5 m 옮기기",
    group: "arrange",
    repeat: true,
  },
  rotate: {
    keys: ["r"],
    label: "선택한 가구 90° 돌리기",
    group: "arrange",
  },
  rotateBack: {
    keys: ["shift+r"],
    label: "반대로 90° 돌리기",
    group: "arrange",
  },
  deleteFurniture: {
    keys: ["delete", "backspace"],
    label: "선택한 가구 빼기",
    group: "arrange",
  },
  arrangeEscape: {
    keys: ["escape"],
    label: "선택 풀기, 집 전체로 나가기",
    group: "arrange",
  },
} satisfies Record<string, Shortcut>

export type ShortcutId = keyof typeof shortcuts

export const shortcutGroups: { id: ShortcutGroup; label: string }[] = [
  { id: "app", label: "어디서나" },
  { id: "structure", label: "구조" },
  { id: "arrange", label: "배치" },
]

export function isApplePlatform() {
  if (typeof navigator === "undefined") return false
  return /mac|iphone|ipad|ipod/i.test(navigator.userAgent)
}

const appleKeys: Record<string, string> = {
  mod: "⌘",
  meta: "⌘",
  ctrl: "⌃",
  alt: "⌥",
  shift: "⇧",
  backspace: "⌫",
  delete: "⌦",
  enter: "↩",
}

const otherKeys: Record<string, string> = {
  mod: "Ctrl",
  meta: "Win",
  ctrl: "Ctrl",
  alt: "Alt",
  shift: "Shift",
  backspace: "Backspace",
  delete: "Delete",
  enter: "Enter",
}

const commonKeys: Record<string, string> = {
  escape: "Esc",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
  slash: "/",
  bracketleft: "[",
  bracketright: "]",
  space: "Space",
}

/** Shift와 함께 누르면 다른 글자가 되는 키는 그 글자로 보여 줍니다. */
const shiftedKeys: Record<string, string> = { slash: "?" }

/** 키 조합 하나를 화면에 보여 줄 키 이름 목록으로 바꿉니다. */
export function formatCombo(tokens: string[], apple = isApplePlatform()) {
  const platformKeys = apple ? appleKeys : otherKeys
  const [last] = tokens.slice(-1)
  if (tokens.length === 2 && tokens[0] === "shift" && shiftedKeys[last])
    return [shiftedKeys[last]]
  return tokens.map(
    (token) => platformKeys[token] ?? commonKeys[token] ?? token.toUpperCase()
  )
}

/** 안내에 보여 줄 키 조합들을 돌려줍니다. */
export function shortcutCombos(id: ShortcutId, apple = isApplePlatform()) {
  const shortcut: Shortcut = shortcuts[id]
  const combos =
    shortcut.display ?? shortcut.keys.map((combo) => combo.split("+"))
  return combos.map((tokens) => formatCombo(tokens, apple))
}

/** 버튼 title처럼 글자로 보여 줄 때 쓰는 첫 번째 키 조합입니다. 예: `⌘⇧Z`, `Ctrl+Shift+Z` */
export function shortcutText(id: ShortcutId, apple = isApplePlatform()) {
  const [combo] = shortcutCombos(id, apple)
  return combo.join(apple ? "" : "+")
}
