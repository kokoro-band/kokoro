# HTML 중간 발표

코코로의 10분 중간 발표 자료입니다. 본문은 12장이고 서버 처리와 팀 역할 및 근거 자료를 담은 부록은 3장입니다. 팀의 원본 Google Slides는 수정하지 않습니다.

## 주소와 게시 시점

GitHub Pages 주소는 https://kokoro-band.github.io/kokoro/presentations/midterm/ 입니다. 이 변경이 `main`에 반영되고 GitHub Pages 데모 워크플로의 배포 단계가 성공한 뒤 접속할 수 있습니다. PR 생성과 빌드 성공만으로 공개 주소가 갱신되지는 않습니다.

자료는 `frontend/public/presentations/midterm/index.html`에 있습니다. Vite가 이 폴더를 빌드 결과에 그대로 복사합니다. 기존 데모는 `/kokoro/`에서 계속 제공하고 발표는 하위 경로에서 제공합니다. 별도의 배포 워크플로나 환경 권한은 추가하지 않습니다.

특정 장을 공유하려면 주소 뒤에 `#9`처럼 장 번호를 붙입니다. `#1`부터 `#12`까지 본문이고 `#13`부터 `#15`까지 부록입니다.

## 조작

| 행동 | 방법 |
|---|---|
| 다음 장 | 오른쪽 방향키 또는 아래쪽 방향키 또는 Space 및 다음 버튼 |
| 이전 장 | 왼쪽 방향키 또는 위쪽 방향키 또는 Shift+Space 및 이전 버튼 |
| 처음과 마지막 | Home과 End |
| 목차 | O 또는 목차 버튼 |
| 발표자 노트 | S 또는 발표자 노트 버튼 |
| 전체 화면 | F 또는 전체 화면 버튼 |
| 인쇄와 PDF 저장 | 인쇄 / PDF 버튼에서 브라우저 인쇄 기능 사용 |
| 모바일 | 이전과 다음 버튼 또는 가로 스와이프 |

버튼에 포커스가 있을 때 Space는 해당 버튼을 실행합니다. 모든 조작 버튼은 Tab으로 접근할 수 있습니다. 발표자 노트는 현재 화면에 표시되므로 화면 공유 중에는 청중에게도 보일 수 있습니다. 인쇄할 때는 노트와 탐색 도구를 제외하고 모든 장을 표시합니다.

## 로컬 확인

```bash
cd frontend
vp install
VITE_API_MODE=local VITE_BASE_PATH=/kokoro/ vp run build
VITE_BASE_PATH=/kokoro/ vp preview --host 127.0.0.1 --port 4187
```

미리보기에서 `http://127.0.0.1:4187/kokoro/presentations/midterm/`를 엽니다. 빌드 결과에는 `dist/presentations/midterm/index.html`과 이미지 및 글꼴이 함께 있어야 합니다.

## 내용 수정

각 `section.slide`가 한 장입니다. 제목은 `data-title`에 적고 발표자 노트는 `data-notes`에 적습니다. 노트에서 예상 설명 시간은 `data-duration`에 표시합니다. 부록에는 `data-appendix`가 있습니다. 목차와 장 번호는 이 정보에서 자동으로 만듭니다.

AI 수치를 수정할 때 평가 대상과 장비 및 측정일과 검토 상태를 함께 확인합니다. 실제 도면 자동 인식과 상용 상품 실측 및 헤드셋 검증을 완료한 것처럼 바꾸지 않습니다. 남은 4주 일정은 가정이며 실제 최종 발표일에 맞춰 수정합니다.

화면과 글꼴 및 Paper 테마 출처는 발표 폴더의 `NOTICE.md`에 있습니다. 새 제목에 기존 파일이 지원하지 않는 글자가 들어가면 시스템 명조 글꼴로 표시될 수 있습니다.
