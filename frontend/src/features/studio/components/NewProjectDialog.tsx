import { useState, type FormEvent } from "react"
import { IconXmarkLine } from "@karrotmarket/react-monochrome-icon"
import {
  ActionButton,
  ContentDialog,
  Icon,
  ResponsivePair,
} from "@seed-design/react"
import { TextField, TextFieldInput } from "seed-design/ui/text-field"

export function NewProjectDialog({
  open,
  onOpenChange,
  busy,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  busy: boolean
  onSubmit: (name: string) => Promise<boolean>
}) {
  const [name, setName] = useState("")

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!name.trim()) return
    if (await onSubmit(name)) {
      setName("")
      onOpenChange(false)
    }
  }

  return (
    <ContentDialog.Root open={open} onOpenChange={onOpenChange}>
      <ContentDialog.Backdrop />
      <ContentDialog.Positioner>
        <ContentDialog.Content className="new-project-dialog">
          <form onSubmit={(event) => void submit(event)}>
            <ContentDialog.Header>
              <ContentDialog.Title>새 프로젝트</ContentDialog.Title>
              <ContentDialog.Description>
                이름을 정하면 바로 집 구조를 잡을 수 있어요.
              </ContentDialog.Description>
              <ContentDialog.CloseButton aria-label="닫기">
                <Icon svg={<IconXmarkLine />} size="x5" />
              </ContentDialog.CloseButton>
            </ContentDialog.Header>
            <ContentDialog.Body>
              <TextField
                label="프로젝트 이름"
                size="medium"
                value={name}
                onValueChange={({ value }) => setName(value)}
                maxGraphemeCount={60}
                required
              >
                <TextFieldInput
                  name="project-name"
                  placeholder="예: 우리 집 거실"
                  autoFocus
                />
              </TextField>
            </ContentDialog.Body>
            <ContentDialog.Footer>
              <ResponsivePair gap="x2">
                <ContentDialog.Action asChild>
                  <ActionButton
                    type="button"
                    variant="neutralWeak"
                    size="medium"
                  >
                    취소
                  </ActionButton>
                </ContentDialog.Action>
                <ActionButton
                  type="submit"
                  variant="brandSolid"
                  size="medium"
                  disabled={busy || !name.trim()}
                  loading={busy}
                >
                  만들기
                </ActionButton>
              </ResponsivePair>
            </ContentDialog.Footer>
          </form>
        </ContentDialog.Content>
      </ContentDialog.Positioner>
    </ContentDialog.Root>
  )
}
