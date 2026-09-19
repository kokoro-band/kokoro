import type { FormEvent, RefObject } from "react"
import { ArrowRight, Box } from "lucide-react"

import { Button } from "@/components/ui/button"

export function NewProjectDialog({
  dialogRef,
  busy,
  onSubmit,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>
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
      dialogRef.current?.close()
    }
  }

  return (
    <dialog ref={dialogRef} className="new-project-dialog">
      <form onSubmit={(event) => void submit(event)}>
        <span className="dialog-icon">
          <Box size={26} />
        </span>
        <h2>새로운 공간을 시작해요</h2>
        <p>프로젝트 이름을 정한 뒤 도면을 업로드하세요.</p>
        <label htmlFor="project-name">프로젝트 이름</label>
        <input
          id="project-name"
          name="project-name"
          placeholder="예: 우리 집 거실"
          required
          maxLength={60}
        />
        <div>
          <Button
            type="button"
            variant="outline"
            onClick={() => dialogRef.current?.close()}
          >
            취소
          </Button>
          <Button type="submit" disabled={busy}>
            프로젝트 만들기 <ArrowRight size={16} />
          </Button>
        </div>
      </form>
    </dialog>
  )
}
