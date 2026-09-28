import { useHotkeys } from "react-hotkeys-hook"

import { shortcuts, type ShortcutId } from "@/features/studio/shortcuts"

/** 대화상자와 메뉴와 목록 상자가 열려 있으면 그 안의 키 조작을 먼저 둡니다. */
const overlaySelector =
  '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]'

/** 화살표 키를 스스로 쓰는 위젯에서는 화살표 단축키를 쉬게 합니다. */
const arrowWidgetSelector =
  '[role="radiogroup"], [role="tablist"], [role="slider"], [role="combobox"], [role="listbox"], [role="menu"]'

function blocked(event: KeyboardEvent, repeat: boolean, arrows: boolean) {
  if (event.repeat && !repeat) return true
  // 한글 조합 중에 누른 키는 글자 입력으로 둡니다.
  if (event.isComposing) return true
  if (document.querySelector('[aria-modal="true"]')) return true
  const target = event.target instanceof Element ? event.target : null
  if (target?.closest(overlaySelector)) return true
  return arrows && Boolean(target?.closest(arrowWidgetSelector))
}

/**
 * `shortcuts`에 등록한 단축키에 동작을 연결합니다. 글을 입력하는 곳에서는
 * 동작하지 않고, 툴바 선택이나 슬라이더에 포커스가 있을 때는 동작합니다.
 */
export function useShortcut(
  id: ShortcutId,
  callback: (event: KeyboardEvent) => void,
  {
    enabled = true,
    keyup = false,
  }: {
    enabled?: boolean
    /** 키를 뗄 때 실행합니다. 수정 키와 상관없이 맞춥니다. */
    keyup?: boolean
  } = {}
) {
  const shortcut = shortcuts[id]
  const keys = shortcut.keys.join(",")
  const repeat = "repeat" in shortcut && shortcut.repeat
  const arrows = keys.includes("arrow")
  useHotkeys(keys, (event) => callback(event), {
    enabled,
    keyup,
    keydown: !keyup,
    ignoreModifiers: keyup,
    preventDefault: !keyup,
    enableOnFormTags: ["radio", "slider"],
    ignoreEventWhen: (event) => blocked(event, repeat, arrows),
    description: shortcut.label,
  })
}
