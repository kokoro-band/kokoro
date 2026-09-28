# SEED Design 도입 및 운영 기준

## 문서 상태

이 문서는 2026년 9월 25일 구현 결과와 이후 확장 기준을 함께 기록합니다. SEED 패키지와 Vite 플러그인을 설치했고 주요 작업 화면을 SEED 컴포넌트와 CLI 스니펫으로 교체했습니다. 화면 흐름과 타이포그래피 규칙은 [`DESIGN.md`](../../DESIGN.md)를 따릅니다.

## 결정

코코로 웹 프론트엔드의 새 UI는 SEED Design v2를 기본으로 사용합니다.

이 문서에서 semantic token은 `#ff6f0f` 같은 색 값이 아니라 `primary`와 `critical`처럼 사용 목적에 따라 이름을 붙인 디자인 값을 뜻합니다. 화면의 의미를 유지하면서 테마와 상태 표현을 일관되게 바꾸기 위해 사용합니다.

- 제품 UI의 색상과 타이포그래피와 간격은 SEED token을 사용합니다.
- 같은 목적의 SEED 컴포넌트가 있으면 자체 컴포넌트를 만들지 않습니다.
- 코코로 전용 UI는 SEED primitive과 컴포넌트를 조합한 얇은 wrapper로 만듭니다.
- Three.js 캔버스 내부는 SEED React 컴포넌트 적용 대상이 아닙니다. 캔버스 위 DOM 오버레이는 적용 대상입니다.
- 당근 로고와 마스코트와 상품 이미지는 사용하지 않습니다.

SEED는 Apache-2.0으로 공개되어 있습니다. 실제 도입 PR에서는 저작권 고지와 라이선스 사본과 변경 사항 표시가 필요한지 확인합니다.

## 전환 결과

| 영역 | 전환 전 | 현재 |
|---|---|---|
| 기본 UI | shadcn과 자체 CSS | SEED v2 |
| 색상 | 소나무색과 모래색 | SEED Primary와 neutral semantic token |
| 글꼴 | Geist와 Noto Sans KR | SEED `--seed-font-family`. Windows는 Pretendard Variable 다이내믹 서브셋 |
| 간격 | 기존 CSS 값 | SEED dimension token |
| 아이콘 | Lucide와 자체 에셋 | UI 동작은 `@karrotmarket/react-monochrome-icon`. 가구 썸네일만 Lucide 그림 |
| 타이포그래피 | 화면마다 다른 px 크기 | `Type` 역할 7가지와 SEED textStyle |
| 3D 장면 | Three.js | 유지. DOM 오버레이만 SEED로 전환 |

## 적용된 의존성과 설정

현재 `@seed-design/react`와 `@seed-design/css`와 `@seed-design/vite-plugin`과 `@karrotmarket/react-monochrome-icon`과 `pretendard`를 사용합니다. 새 환경에서는 저장소 규칙에 따라 먼저 `vp install`을 실행합니다. 의존성을 다시 구성해야 할 때는 다음 명령을 사용합니다.

```bash
cd frontend
vp add @seed-design/react @seed-design/css
vp add pretendard
vp add -D @seed-design/vite-plugin
```

기본 CSS는 `frontend/src/index.css`에서 한 번만 가져옵니다. base CSS와 실제 사용하는 recipe CSS만 명시적으로 가져오며 새 SEED 컴포넌트를 쓰면 해당 recipe를 목록에 추가합니다. 빠뜨린 recipe는 빌드 결과의 `seed-*` 클래스 이름과 `@seed-design/css/recipes` 파일 이름을 비교해 찾을 수 있습니다.

글꼴은 SEED 안내대로 `body`에 `var(--seed-font-family)`를 선언하고 Pretendard 다이내믹 서브셋 CSS를 함께 가져옵니다.

컴포넌트는 `@seed-design/react`에서 직접 가져오거나 SEED CLI 스니펫을 `frontend/seed-design/ui`에 받아 `seed-design/ui/*`로 가져옵니다. 설정은 다음과 같습니다.

```json
{
  "rsc": false,
  "tsx": true,
  "path": "./seed-design"
}
```

`tsconfig.app.json`에는 `seed-design/*` path alias와 `seed-design` include와 `node` 타입이 있고 `vite.config.ts`에는 같은 alias가 있습니다. 스니펫은 생성 파일이므로 fmt와 lint 대상에서 제외합니다. 현재 Vite Plus의 `lazyPlugins` 안에서 `seedDesignPlugin({ colorMode: "light-only" })`이 정상 동작하는 것을 확인했습니다.

1. 라이트 색상 모드 메타데이터가 적용됩니다.
2. base CSS와 recipe CSS는 한 번만 로드됩니다.
3. `vp check`와 `vp run build`가 통과합니다.

## 컴포넌트 생성 원칙

기본 선택은 `@seed-design/react`의 공개 컴포넌트를 직접 사용하는 것입니다. SEED CLI로 가져와야 하는 컴포넌트는 `frontend/seed-design/ui`에 두며 이 디렉터리에는 사업 로직을 넣지 않습니다.

```bash
npx @seed-design/cli@latest add ui:menu --on-diff overwrite
```

현재 받은 스니펫은 action-button, callout, chip-tabs, content-placeholder, list, list-header, loading-indicator, menu, progress-circle, result-section, segmented-control, select, slider, snackbar, tabs, text-field, toggle-button입니다.

### 사용 시 주의

- Snackbar는 선언형으로 그리면 나타나지 않습니다. `SnackbarProvider`와 `useSnackbarAdapter().create()`를 사용합니다.
- Loading Indicator는 대기 중인 버튼 안에서만 동작합니다. 버튼 밖의 로딩은 Progress Circle과 글을 함께 둡니다.
- Result Section의 기본 버튼은 `neutralWeak`이므로 `bg.layerDefault` 위에 둡니다.
- Content Dialog는 `word-break: break-all`을 쓰므로 한글 어절 줄바꿈을 앱에서 되돌립니다.
- Segmented Control 항목은 최소 86px인 알약 모양이라 툴바에 넣으면 크고 무거워집니다. 툴바와 내비게이션은 ghost Action Button과 `bg.transparentSelected`로 만든 `ToolbarChoice`를 씁니다.
- Slider의 `onValuesCommit`은 포인터를 뗄 때만 불리므로 키보드 조작은 `onKeyUp`에서 따로 확정합니다.
- 숨겨 둔 화면 안에서는 `SnackbarAvoidOverlap`을 쓰지 않습니다. 크기가 0으로 재어져 Snackbar 위치가 틀어질 수 있습니다.

- SEED 생성 파일은 임의로 구조를 바꾸지 않습니다.
- 서비스 맞춤 로직은 `frontend/src/components/kokoro`와 feature 컴포넌트에 둡니다.
- wrapper는 SEED props와 접근성 동작을 그대로 전달합니다.
- 새 CSS 컴포넌트를 만들기 전에 SEED 컴포넌트 검색 결과를 이슈에 기록합니다.

## 코코로 컴포넌트 매핑

| 현재 영역 | SEED 구성 | 분류 | 비고 |
|---|---|---|---|
| 상단 네비게이션 | Flex와 Text와 Action Button | Wrapper | `WorkspaceTopNavigation` |
| 저장 | Action Button | Direct | `brandSolid` |
| 내보내기 | Action Button | Direct | `neutralOutline` |
| 가구와 도면 탭 | Tabs | Direct | 현재 선택 상태를 탭으로 표시 |
| 가구 필터 | Chip Toggle | Direct | 여러 개 선택 허용 |
| 가구 목록 | List와 Image Frame | Wrapper | 버튼 카드보다 밀도 높은 목록 우선 |
| 도면 업로드 | Attachment Field | Wrapper | 파일 형식과 크기 검증은 feature 로직으로 유지 |
| 2D와 3D와 WebXR 전환 | Segmented Control | Direct | 동시에 하나만 선택 |
| 되돌리기와 다시 실행 | Action Button | Direct | 아이콘과 접근성 라벨 필수 |
| 3D 툴바 | Action Button 그룹 | Wrapper | `SpatialViewportToolbar` |
| 3D 방 라벨과 치수 | Text token을 사용한 DOM overlay | Token only | `DimensionRulerHUD` |
| 가구 속성 | Slider와 Select와 Text Field와 Action Button | Direct | 삭제는 critical action |
| AI 입력 | Text Field의 Textarea와 Action Button | Direct | 규칙 기반 데모 상태 명시 |
| 프로젝트 생성 | Dialog와 Text Field와 Action Button | Direct | 제목과 선택 중심 |
| 짧은 결과 알림 | Snackbar | Direct | 관련 행동은 최대 하나 |
| 전체 화면 오류 | Result Section | Direct | 원인과 다음 행동 제공 |
| 모바일 속성 패널 | Bottom Sheet | Direct | 작업 캔버스를 유지 |
| 데스크톱 속성 패널 | Side Panel | Direct | 상태와 포커스 트랩은 SEED에 위임 |

## 도입 순서

### 1단계. 기반과 상태 표현

- 패키지와 base CSS와 테마 설정을 추가합니다.
- Action Button과 Text와 Divider과 Snackbar를 도입합니다.
- 색상을 헥스 값에서 semantic token으로 전환합니다.

### 2단계. 네비게이션과 입력

- Tabs와 Segmented Control과 Chip을 전환합니다.
- Dialog와 Text Field와 Attachment Field를 전환합니다.
- 키보드 포커스와 오류 메시지를 같이 검증합니다.

### 3단계. 목록과 패널

- 가구 카드를 List 기반 정보 구조로 재설계합니다.
- 데스크톱 Side Panel과 모바일 Bottom Sheet를 분리합니다.
- 반응형 전환 전후의 작업 상태를 유지합니다.

### 4단계. 3D 오버레이

- 툴바와 방 라벨과 치수 표시를 토큰 기반으로 전환합니다.
- Three.js 파이프라인과 WebXR 세션 로직은 변경하지 않습니다.
- 2D와 3D와 WebXR에서 같은 가구 선택과 배치 상태가 유지되는지 확인합니다.

## PR 단위

하나의 PR에서 전체 화면을 교체하지 않습니다.

1. SEED 기반 설정과 라이선스
2. 주요 행동과 피드백
3. 네비게이션과 필터
4. 입력과 Dialog
5. 가구 목록
6. 속성 패널
7. 3D 오버레이
8. 기존 shadcn과 남은 자체 CSS 제거

각 PR은 이전 단계가 병합된 뒤 시작합니다.

## 인수 기준

- 새 UI 컴포넌트의 적합성 검토에 SEED 문서 링크가 있습니다.
- 대체할 SEED 컴포넌트가 없는 wrapper만 남습니다.
- wrapper에 서버 요청과 상태 소유권과 3D 로직이 없습니다.
- 색상과 간격과 radius는 SEED token 또는 컴포넌트 recipe에서 옵니다.
- 데스크톱과 390px 너비 모바일에서 핵심 흐름을 완료할 수 있습니다.
- 키보드로 모든 대화형 컴포넌트를 조작할 수 있습니다.
- `prefers-reduced-motion` 설정에서 핵심 흐름이 유지됩니다.
- 2D와 3D와 WebXR의 배치 데이터가 같게 유지됩니다.
- `vp check`와 `vp run build`가 통과합니다.
- 실제 WebXR 헤드셋 검증은 로컬 빌드 검증과 별도로 기록합니다.

## 명시적 비범위

- 당근 로고와 마스코트와 제품 이미지를 복제하지 않습니다.
- 가구 배치 알고리즘과 도면 변환과 WebXR 세션 로직은 디자인 전환 범위에 포함하지 않습니다.
- 실제 WebXR 헤드셋 검증은 브라우저 화면 검증과 별도로 진행합니다.

## 주요 리스크

### Vite Plus 호환성

공식 문서는 Vite 설정을 기준으로 작성되어 있습니다. 코코로의 Vite Plus `lazyPlugins`에서도 플러그인과 라이트 색상 모드가 동작하며 빌드까지 검증했습니다. Vite Plus나 SEED 버전을 올릴 때 같은 검증을 다시 실행합니다.

### 전역 CSS 충돌

SEED base CSS와 기존 reset과 Tailwind의 적용 순서에 따라 캔버스 크기와 폼 요소가 바뀔 수 있습니다. 기반 PR에서 상세 화면 교체 전에 확인합니다.

### 반응형 패널

데스크톱 Side Panel과 모바일 Bottom Sheet는 상태를 공유해야 합니다. 두 컴포넌트가 동시에 mount되어 중복 포커스를 만들지 않도록 검증합니다.

## 참고

- [SEED Get Started](https://seed-design.io/get-started)
- [SEED React Vite 설치](https://seed-design.io/react/getting-started/installation/vite)
- [SEED Components](https://seed-design.io/components)
- [SEED Theming](https://seed-design.io/react/getting-started/styling/theming)
- [SEED Tailwind CSS](https://seed-design.io/react/getting-started/styling/tailwind-css)
