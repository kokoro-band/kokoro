import { Plus } from "lucide-react"
import { ActionButton } from "@seed-design/react"

export function AppHeader({ onCreate }: { onCreate: () => void }) {
  return (
    <header className="app-header">
      <a
        className="brand"
        href="#workspace"
        aria-label="코코로 리모델링 스튜디오"
      >
        <img
          className="brand-mark pixel-art"
          src="/assets/pixel/kokoro-mark.svg"
          alt=""
        />
        <strong>kokoro</strong>
      </a>
      <ActionButton size="small" variant="neutralWeak" onClick={onCreate}>
        <Plus size={16} />
        새 프로젝트
      </ActionButton>
    </header>
  )
}
