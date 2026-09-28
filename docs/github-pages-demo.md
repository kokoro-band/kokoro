# GitHub Pages 데모

데모 주소는 https://kokoro-band.github.io/kokoro/ 입니다. 로그인이나 서버 설치 없이 브라우저에서 구조를 편집하고 가구를 배치할 수 있습니다.

## 데모에서 가능한 작업

방 구조를 만들고 가구를 옮긴 뒤 같은 배치를 2D와 3D로 확인합니다. 작업은 방문자의 브라우저에 저장됩니다. 같은 브라우저에서 새로고침하면 저장한 배치를 다시 열 수 있습니다. 다른 기기와 데이터를 공유하지 않으며 브라우저 저장소를 지우면 작업도 사라집니다.

Spring API와 DB 및 Ollama는 이 배포에 포함되지 않습니다. 자연어 명령은 프론트엔드에 구현된 규칙으로 처리합니다. 도면 파일 업로드와 이미지 분석의 지원 범위는 [제품 문서](../PRODUCT.md)를 따릅니다. GitHub Pages의 HTTPS 주소는 웹 VR 접속에 사용할 수 있지만 실제 헤드셋과 컨트롤러의 동작은 별도로 확인해야 합니다.

## 자동 배포

CD는 코드 변경을 검사하고 웹사이트에 자동으로 게시하는 과정입니다. [GitHub Pages 데모 워크플로](../.github/workflows/pages.yml)가 프론트엔드를 검사하고 테스트와 빌드를 완료한 결과만 게시합니다.

| 발생한 작업 | 결과 |
|---|---|
| `codex/github-pages-demo`의 프론트엔드 또는 배포 설정 변경 | 초기 데모 브랜치의 화면을 자동 게시합니다. |
| 워크플로가 반영된 `main`의 프론트엔드 또는 배포 설정 변경 | `main`의 화면을 자동 게시합니다. |
| 프론트엔드 또는 배포 설정을 바꾸는 PR | 데모용 경로로 빌드까지 검사합니다. 사이트는 바꾸지 않습니다. |
| 수동 실행 | 위 두 배포 브랜치 중 선택한 브랜치를 게시합니다. |

두 배포 브랜치는 같은 주소를 사용합니다. 마지막으로 성공한 배포가 표시되므로 `main`으로 운영을 전환하면 초기 데모 브랜치에 새 커밋을 올리지 않습니다. 기존 PR을 머지하지 않아도 초기 데모 브랜치에서 첫 배포를 할 수 있습니다. 최초 데모에는 커서 도구 PR #90과 가구 오류 복구 PR #88이 포함됩니다.

저장소의 Settings > Pages에서 Source를 GitHub Actions로 설정합니다. `github-pages` 환경의 배포 허용 브랜치는 `main`과 `codex/github-pages-demo`로 제한합니다. 배포 권한은 워크플로의 배포 단계에만 부여하며 별도 토큰이나 API 키는 필요하지 않습니다.

빌드 환경에는 `VITE_API_MODE=local`과 `VITE_BASE_PATH=/kokoro/`가 지정됩니다. 두 번째 값은 사이트가 도메인 바로 아래가 아닌 `/kokoro/` 아래에 있다는 뜻입니다. 로고와 가구 모델도 이 경로를 기준으로 불러옵니다. 로컬 개발은 설정이 없으면 기존 `/` 경로를 사용합니다.

## 배포 확인과 재실행

GitHub의 Actions에서 GitHub Pages 데모 실행을 열어 build와 deploy가 모두 성공했는지 확인합니다. 그다음 데모 주소에서 로고와 가구가 표시되는지 확인하고 배치를 바꾼 뒤 새로고침해 저장된 결과를 확인합니다. 빌드 성공만으로 화면과 웹 VR 검증을 대신하지 않습니다.

실행이 실패하면 해당 실행의 Re-run failed jobs로 다시 실행할 수 있습니다. 빌드 실패 시 기존 사이트는 유지됩니다. 워크플로가 `main`에 반영된 뒤에는 Run workflow에서도 허용된 배포 브랜치를 선택해 게시할 수 있습니다. 화면을 이전 상태로 되돌려야 하면 원인이 된 변경을 되돌리는 커밋을 배포 브랜치에 올립니다.

## 로컬에서 배포 빌드 확인

```bash
cd frontend
vp install
vp check
vp test
VITE_API_MODE=local VITE_BASE_PATH=/kokoro/ vp run build
VITE_BASE_PATH=/kokoro/ vp preview
```

미리보기 주소는 `http://localhost:4173/kokoro/`입니다. 이 명령은 배포 결과를 로컬에서 확인하는 용도입니다.

## 저장소 공개 범위

저장소를 Public으로 전환하면 웹 데모와 함께 저장소의 코드와 커밋 이력 및 이슈와 PR도 공개됩니다. 데모에 입력한 배치는 방문자의 브라우저 안에 저장되며 GitHub 저장소에 업로드되지 않습니다.

설정 근거는 [GitHub Pages 공식 안내](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)와 [Vite 배포 안내](https://vite.dev/guide/static-deploy#github-pages)입니다.
