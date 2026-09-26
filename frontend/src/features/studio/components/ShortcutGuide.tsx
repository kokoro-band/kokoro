import { IconXmarkLine } from "@karrotmarket/react-monochrome-icon"
import { ContentDialog, Icon } from "@seed-design/react"

import { Type } from "@/components/kokoro/Type"
import {
  shortcutCombos,
  shortcutGroups,
  shortcuts,
  shortcutText,
  type ShortcutGroup,
  type ShortcutId,
} from "@/features/studio/shortcuts"

import type { StudioView } from "./AppBar"

const shortcutIds = Object.keys(shortcuts) as ShortcutId[]

/** 지금 화면의 단축키를 어디서나 쓰는 단축키 바로 뒤에 둡니다. */
function orderedGroups(view: StudioView) {
  const current: ShortcutGroup | null =
    view === "structure" ? "structure" : view === "arrange" ? "arrange" : null
  return [...shortcutGroups].sort(
    (a, b) =>
      Number(b.id === "app") - Number(a.id === "app") ||
      Number(b.id === current) - Number(a.id === current)
  )
}

export function ShortcutGuide({
  open,
  view,
  onOpenChange,
}: {
  open: boolean
  view: StudioView
  onOpenChange: (open: boolean) => void
}) {
  return (
    <ContentDialog.Root open={open} onOpenChange={onOpenChange} size="large">
      <ContentDialog.Backdrop />
      <ContentDialog.Positioner>
        <ContentDialog.Content className="shortcut-guide">
          <ContentDialog.Header>
            <ContentDialog.Title>단축키</ContentDialog.Title>
            <ContentDialog.Description>
              글을 쓰는 중에는 단축키가 동작하지 않아요. 언제든{" "}
              {shortcutText("guide")} 키로 이 안내를 다시 열 수 있어요.
            </ContentDialog.Description>
            <ContentDialog.CloseButton aria-label="닫기">
              <Icon svg={<IconXmarkLine />} size="x5" />
            </ContentDialog.CloseButton>
          </ContentDialog.Header>
          <ContentDialog.Body className="shortcut-guide-body">
            {orderedGroups(view).map((group) => (
              <section
                key={group.id}
                className="shortcut-group"
                aria-labelledby={`shortcut-group-${group.id}`}
              >
                <Type
                  variant="heading"
                  as="h3"
                  id={`shortcut-group-${group.id}`}
                >
                  {group.label}
                </Type>
                <dl className="shortcut-list">
                  {shortcutIds
                    .filter((id) => shortcuts[id].group === group.id)
                    .map((id) => (
                      <div key={id} className="shortcut-row">
                        <Type variant="description" as="dt">
                          {shortcuts[id].label}
                        </Type>
                        <dd className="shortcut-keys">
                          {shortcutCombos(id).map((combo, index) => (
                            <span key={combo.join()} className="shortcut-combo">
                              {index > 0 && (
                                <Type variant="caption" aria-hidden="true">
                                  /
                                </Type>
                              )}
                              {combo.map((key) => (
                                <kbd key={key} className="shortcut-key">
                                  <Type variant="caption" color="fg.neutral">
                                    {key}
                                  </Type>
                                </kbd>
                              ))}
                            </span>
                          ))}
                        </dd>
                      </div>
                    ))}
                </dl>
              </section>
            ))}
          </ContentDialog.Body>
        </ContentDialog.Content>
      </ContentDialog.Positioner>
    </ContentDialog.Root>
  )
}
