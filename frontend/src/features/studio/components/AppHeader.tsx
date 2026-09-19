import { Box } from "lucide-react"

import { isServerMode } from "@/features/studio/project-api"

export function AppHeader({ onCreate }: { onCreate: () => void }) {
  return (
    <header className="app-header">
      <a className="brand" href="#workspace" aria-label="코코로 스튜디오">
        <span className="brand-mark">
          <Box size={20} />
        </span>
        kokoro<span className="brand-word">studio</span>
      </a>
      <nav className="header-nav" aria-label="주 메뉴">
        <a className="active" href="#workspace">
          내 공간
        </a>
        <button onClick={onCreate}>새 프로젝트</button>
      </nav>
      <div className="header-right">
        <span className="mode-label">
          <span />
          {isServerMode ? "서버 연결 모드" : "로컬 데모"}
        </span>
        <button className="avatar" title="현재는 로그인 없는 데모입니다">
          K
        </button>
      </div>
    </header>
  )
}
