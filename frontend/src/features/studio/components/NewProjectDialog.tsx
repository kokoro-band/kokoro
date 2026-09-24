import type { FormEvent } from "react"
import { ArrowRight } from "lucide-react"
import {
  ActionButton,
  ContentDialog,
  Field,
  TextField,
} from "@seed-design/react"

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
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const name = new FormData(form).get("project-name")
    if (typeof name !== "string") return
    if (await onSubmit(name)) {
      form.reset()
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
                프로젝트 이름을 정한 뒤 도면을 업로드하세요.
              </ContentDialog.Description>
            </ContentDialog.Header>
            <ContentDialog.Body>
              <Field.Root>
                <Field.Label>프로젝트 이름</Field.Label>
                <TextField.Root size="responsive">
                  <TextField.Input
                    name="project-name"
                    placeholder="예: 우리 집 거실"
                    required
                    maxLength={60}
                  />
                </TextField.Root>
              </Field.Root>
            </ContentDialog.Body>
            <ContentDialog.Footer>
              <ContentDialog.Action asChild>
                <ActionButton
                  type="button"
                  variant="neutralOutline"
                  size="medium"
                >
                  취소
                </ActionButton>
              </ContentDialog.Action>
              <ActionButton
                type="submit"
                variant="brandSolid"
                size="medium"
                disabled={busy}
                loading={busy}
              >
                프로젝트 만들기 <ArrowRight size={16} />
              </ActionButton>
            </ContentDialog.Footer>
          </form>
        </ContentDialog.Content>
      </ContentDialog.Positioner>
    </ContentDialog.Root>
  )
}
