import { Check } from "lucide-react"

export function StudioFooter() {
  return (
    <footer className="app-footer">
      <span>
        <Check size={13} />
        도면과 배치 데이터를 하나의 프로젝트로
      </span>
      <span>코코로 리모델링 스튜디오</span>
    </footer>
  )
}
