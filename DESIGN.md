---
name: Kokoro SEED Design System
description: 따뜻한 오렌지와 조용한 중립 색을 사용하는 SEED 기반 리모델링 작업 환경
colors:
  primary: "#ff6f0f"
  primary-pressed: "#ff9e66"
  canvas: "#ffffff"
  background: "#f2f3f6"
  surface: "#f7f8fa"
  foreground: "#212124"
  muted: "#868b94"
  hairline: "#eaebee"
  brand-weak: "#fff5f0"
  critical: "#fa2314"
  informative: "#009ceb"
  positive: "#1aa174"
typography:
  display:
    textStyle: "screenTitle"
    fontSize: "1.625rem"
    fontWeight: 700
    lineHeight: "2.1875rem"
  title:
    textStyle: "t6Bold"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: "1.5rem"
  heading:
    textStyle: "t5Bold"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: "1.375rem"
  body:
    textStyle: "t5Regular"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: "1.375rem"
  description:
    textStyle: "t4Regular"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.1875rem"
  label:
    textStyle: "t4Medium"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: "1.1875rem"
  caption:
    textStyle: "t3Regular"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: "1.125rem"
rounded:
  r0_5: "2px"
  r1: "4px"
  r1_5: "6px"
  r2: "8px"
  r2_5: "10px"
  r3: "12px"
  r4: "16px"
  r5: "20px"
  r6: "24px"
  full: "9999px"
spacing:
  x0_5: "2px"
  x1: "4px"
  x2: "8px"
  x3: "12px"
  x4: "16px"
  x5: "20px"
  x6: "24px"
  x8: "32px"
  x10: "40px"
  x12: "48px"
  x16: "64px"
---

# Design System: Kokoro SEED

> 이 문서는 2026년 9월 25일 구현을 기준으로 한 현재 규격입니다. 새 UI도 이 규칙을 따르며 세부 전환 기록과 검증 기준은 [`docs/design-system/seed-adoption.md`](docs/design-system/seed-adoption.md)를 따릅니다.

## Overview

**Creative North Star: "따뜻한 공간 도구"**

코코로는 당근의 제품 디자인 시스템인 SEED v2를 화면 UI의 기본 언어로 사용합니다. 색상과 타이포그래피와 간격은 SEED의 역할 기반 토큰을 따르고 대화형 컴포넌트는 가능한 한 SEED React를 직접 사용합니다. 당근의 로고와 마스코트와 서비스 문구는 복제하지 않습니다.

화면의 중심은 여전히 사용자가 꾸미는 방입니다. UI는 콘텐츠와 3D 공간을 방해하지 않는 중립 배경을 사용하며 주요 행동과 현재 선택에만 따뜻한 오렌지를 사용합니다. 그라데이션과 유리 효과와 과한 카드 장식은 제거합니다.

**Key Characteristics:**

- SEED v2 컴포넌트와 토큰 우선
- 주요 행동에만 사용하는 따뜻한 오렌지
- 방과 가구를 먼저 보여 주는 작업 도구 구조
- SEED 글꼴 스택과 의미 기반 타이포그래피 역할 7가지
- 장식보다 정보 계층과 간격으로 만드는 강조
- 실제 AI와 규칙 기반 데모를 구분하는 솔직한 표현

## Colors

팔레트는 SEED의 역할 기반 색상을 사용합니다. 실제 컴포넌트에서는 위 헥스 값을 직접 입력하지 않고 `fg.neutral`과 `bg.layerDefault`와 같은 SEED semantic token을 사용합니다.

### Primary

- **SEED Primary:** 저장이나 확정이나 WebXR 진입과 같은 핵심 행동에 사용합니다.
- **Brand Weak:** 선택 배경과 짧은 성공 피드백에만 사용합니다.

### Secondary

- 두 번째 브랜드 색은 두지 않습니다. 정보와 성공과 위험 색은 상태를 알리는 의미로만 사용합니다.

### Neutral

- **Canvas:** 주요 작업 화면과 대화형 컴포넌트의 기본 배경입니다.
- **Background:** 페이지 배경과 패널 사이를 구분합니다.
- **Surface:** 가구 목록과 속성 영역과 설명 영역을 조용히 구분합니다.
- **Foreground:** 제목과 본문과 아이콘의 기본 색입니다.
- **Muted:** 부가 설명과 상태 정보에 사용합니다.
- **Hairline:** 정보 영역의 경계가 필요할 때만 사용합니다.

**The One Orange Rule.** 한 화면에서 경쟁하는 오렌지 행동을 두 개 이상 두지 않습니다. `#ff6600`은 당근 마케팅 화면의 별도 값이며 코코로 제품 UI에서는 사용하지 않습니다.

**The Semantic Color Rule.** 랜덤 헥스 색과 Tailwind 팔레트 색을 직접 사용하지 않습니다. 가능한 한 SEED semantic token을 사용합니다.

## Typography

**Font:** SEED가 제공하는 `--seed-font-family`를 `body`에 적용합니다. macOS와 iOS와 Android는 시스템 글꼴을, Windows는 앱이 불러오는 Pretendard Variable 다이내믹 서브셋을 사용합니다. Three.js 방 이름표도 같은 글꼴을 읽어 그립니다.

**Character:** 글꼴은 브랜드를 과시하기보다 사용자의 도면과 가구 정보를 맑게 전달해야 합니다.

### The One Type Rule

글자 크기와 두께는 모양이 아니라 **의미**로 고릅니다. 화면 코드는 CSS에서 `font-size`나 `font-weight`를 정하지 않고 `src/components/kokoro/Type.tsx`의 `Type` 컴포넌트에 역할을 넘깁니다. 역할 표는 `type-roles.ts` 한 곳에만 있으며 SEED `Text`의 textStyle로 연결됩니다.

| 역할 | SEED textStyle | 색 | 쓰는 곳 |
|---|---|---|---|
| `display` | `screenTitle` | `fg.neutral` | 화면 하나를 대표하는 제목. 한 화면에 하나만 둡니다 |
| `title` | `t6Bold` | `fg.neutral` | 패널 제목과 지금 선택한 대상의 이름, 합계 금액 |
| `heading` | `t5Bold` | `fg.neutral` | 패널 안에서 내용을 묶는 소제목 |
| `body` | `t5Regular` | `fg.neutral` | 사용자가 읽어야 하는 문장과 AI 대화 |
| `description` | `t4Regular` | `fg.neutralMuted` | 제목이나 조작을 돕는 짧은 설명 |
| `label` | `t4Medium` | `fg.neutral` | 항목과 필드의 이름처럼 대상을 가리키는 글 |
| `caption` | `t3Regular` | `fg.neutralMuted` | 개수와 단위와 저장 상태 같은 부가 정보 |

- 금액과 치수처럼 자릿수를 맞춰 읽어야 하는 숫자는 `numeric`으로 표 숫자를 켭니다.
- SEED 컴포넌트 안의 글자는 SEED 레시피를 그대로 따릅니다.
- 평면도 SVG처럼 미터 단위로 그리는 글자도 역할의 두께를 따릅니다. 방 이름은 `label`과 같은 medium입니다.
- 한글은 `word-break: keep-all`로 어절 단위로 줄을 바꿉니다.

**The Scale Before Color Rule.** 제목과 본문의 차이는 먼저 크기와 두께와 간격으로 만듭니다. 단어에 별도 색이나 그라데이션을 입혀 강조하지 않습니다.

### Voice

SEED 글쓰기 원칙을 따라 해요체와 능동문을 사용합니다. 데이터의 변화보다 사용자의 행동을 말합니다. 예: `라운드 테이블을 놓았어요`, `구조를 저장했어요`. 조사 을/를은 `withObjectParticle`로 받침에 맞춰 붙입니다.

## Layout

### 화면 흐름

앱 바 가운데의 글자 내비게이션 하나가 작업 화면을 바꿉니다. SEED 사이트 상단 내비게이션처럼 현재 화면은 굵은 글자로만 표시하고, 배경은 hover에만 씁니다. 뷰포트 도구는 고른 항목에 `bg.transparentSelected` 배경을 깔아 한 단계 아래의 선택임을 구분합니다. 화면을 바꾸는 버튼을 다른 곳에 두지 않습니다.

| 화면 | 목적 | 구성 |
|---|---|---|
| 구조 | 도면 이미지나 평수에서 방을 나누고 문과 창을 놓습니다 | 가운데 평면도와 오른쪽 방과 집 정보 |
| 배치 | 방을 골라 가구를 놓고 2D와 3D와 VR로 확인합니다 | 왼쪽 방과 가구, 가운데 화면, 오른쪽 선택한 가구와 AI 배치 |
| 내역 | 방별 가구와 예상 비용을 확인합니다 | 가운데 정렬된 목록 |

- 구조에서 저장하지 않은 초안은 다른 화면으로 가도 유지되며 구조 항목에 알림 점이 붙습니다.
- 배치의 범위는 집 전체와 방 하나 사이를 오갑니다. 왼쪽 패널 맨 위의 뒤로 버튼과 화면 오른쪽 위 미니맵이 같은 범위를 바꿉니다.
- 프로젝트 만들기와 예제 집 열기와 도면 파일과 JSON 내보내기는 앱 바 왼쪽 프로젝트 메뉴에 모읍니다.
- 저장은 자동입니다. 저장 결과는 앱 바에 계속 띄우지 않고 Snackbar로 알립니다. 다른 알림이 45초 동안 없었을 때만 `자동으로 저장했어요`를 보여 주고, 실패하면 critical Snackbar의 `다시 저장`과 앱 바 오른쪽의 `다시 저장` 버튼으로 다시 시도합니다.

### 골격

구조와 배치는 같은 뷰포트 골격을 씁니다. 48px 툴바의 왼쪽에는 `ToolbarChoice`로 도구나 보기 방식을, 오른쪽에는 추가와 실행 취소와 다시 실행을 둡니다. 도구에 하위 선택이 있으면 구분선 뒤에 같은 모양으로 붙입니다. 화면 위 안내는 왼쪽 아래 캡션 하나로만 보여 주고 Snackbar가 그 위로 비켜 가도록 `SnackbarAvoidOverlap`으로 감쌉니다. VR 안내와 VR 진입 버튼은 화면 가운데 카드에 함께 둡니다.

**The No Pill Toolbar Rule.** 툴바와 앱 내비게이션에는 알약 모양 Segmented Control을 쓰지 않습니다. 둥근 컨테이너가 겹쳐 보이고 공간을 크게 차지하기 때문입니다. Segmented Control은 SEED 권장처럼 2개에서 4개 사이의 폼 선택이 화면의 주인공일 때만 씁니다. 패널은 `panel-header`, `panel-body`, `panel-footer`와 `inspector-section`으로 같은 간격을 씁니다.

820px 이하에서는 화면 전환이 앱 바 두 번째 줄로 내려가고 배치 도구는 아래 도크와 Bottom Sheet로 바뀝니다. 구조는 평면도 아래에 정보 패널이 이어지고 저장 버튼이 아래에 붙습니다.

페이지 구성은 4px 리듬을 기본으로 합니다. 간격과 모서리와 그림자와 모션은 SEED 토큰만 사용합니다. 패널 폭처럼 화면 골격을 정하는 값만 `--layout-*` 변수로 둡니다.

2D와 3D와 WebXR은 같은 배치 데이터를 사용합니다. DOM 오버레이에는 SEED를 적용하고 Three.js 캔버스 내부의 메시와 조명과 선택 외곽선은 렌더링 영역으로 분리합니다.

## Elevation & Depth

기본 화면은 평면적입니다. 배경 톤과 여백과 Divider로 영역을 구분합니다. 그림자는 Dialog와 Bottom Sheet와 Side Panel처럼 실제로 다른 레이어에 있는 SEED 컴포넌트가 자신의 레시피로 제공할 때만 사용합니다.

**The Flat By Default Rule.** 일반 패널과 가구 항목에 대형 그림자를 추가하지 않습니다. 유리 효과와 빛나는 테두리와 배경 블러를 사용하지 않습니다.

## Shapes

모서리는 SEED 컴포넌트 레시피를 그대로 따릅니다. 모든 표면을 큰 라운드 카드로 만들지 않습니다. `full`은 Chip과 프로필 이미지처럼 형태가 공식적으로 요구하는 경우에만 사용합니다.

도트 로고는 코코로의 아이덴티티 자산으로 헤더와 파비콘에만 사용합니다. 패널과 상태와 빈 화면에는 별도 캐릭터나 장식 일러스트를 반복하지 않습니다.

## Components

**The SEED First Rule.** 새 화면과 기존 화면의 UI 컴포넌트는 반드시 SEED를 먼저 검토합니다. 상태와 접근성과 키보드 동작은 자체 CSS로 다시 만들지 않습니다.

1. 같은 목적의 SEED 컴포넌트가 있으면 직접 사용합니다.
2. 조합이 필요하면 SEED primitive과 UI 컴포넌트로 얇은 wrapper를 만듭니다.
3. wrapper는 레이아웃과 라벨 조합만 담습니다. 서버 요청과 상태 소유와 3D 로직을 넣지 않습니다.
4. SEED와 다른 동작을 만들어야 하면 이유와 대안 검토를 이슈에 기록합니다.

### Required mapping

SEED CLI로 가져온 스니펫은 `frontend/seed-design/ui`에 있고 `seed-design/ui/*`로 가져옵니다. 스니펫은 고치지 않습니다.

| 코코로 UI | SEED 기본 | 적용 방식 |
|---|---|---|
| 구조와 배치와 내역 전환 | Action Button ghost와 Notification Badge | `app-nav`. 현재 화면은 굵게, 배경은 hover에만 |
| 2D와 3D와 VR 전환, 구조 편집 도구, 방 모양 | Action Button ghost | `ToolbarChoice` wrapper. radio 그룹과 화살표 키 |
| 프로젝트 메뉴와 새로 시작 | Menu | 스니펫. `size="small"` |
| 대화상자 버튼 한 쌍 | Responsive Pair와 Action Button | 직접 사용. 버튼은 `medium` |
| 방 목록과 가구 목록과 내역 | List | 스니펫 `ListButtonItem`과 `ListItem` |
| 가구 추가와 배치한 가구, 선택한 가구와 AI 배치 | Tabs | 스니펫 |
| 가구 종류 필터 | Chip Tabs와 Scroll Fog | 스니펫과 직접 사용 |
| AI 요청 예시 | Chip과 Scroll Fog | 직접 사용. 한 줄 가로 스크롤 |
| 치수와 이름과 요청 입력 | Text Field | 스니펫. 치수는 `MeterField` wrapper |
| 가구 방향 | Slider | 스니펫 |
| 깎을 모서리 | Select | 스니펫 |
| 경고와 오류 | Callout | 스니펫 |
| 빈 화면과 불러오기 오류 | Result Section | 스니펫. 기본 레이어 위에 둡니다 |
| 로딩과 진행률 | Progress Circle | 스니펫. Loading Indicator는 버튼 안에서만 씁니다 |
| 저장 결과와 짧은 피드백 | Snackbar | 스니펫 어댑터. 모바일 도크는 Avoid Overlap |
| 새 프로젝트와 도면 파일과 도면 이미지로 시작 | Content Dialog | 직접 사용 |
| 모바일 도구 | Bottom Sheet | 직접 사용 |
| 상태 표시 | Badge | 직접 사용 |
| 모든 글자 | Text | `Type` wrapper로 역할만 지정 |

### Iconography

UI 동작 아이콘은 SEED 아이콘 라이브러리 `@karrotmarket/react-monochrome-icon`의 Line 아이콘을 `Icon`과 `PrefixIcon`으로 씁니다. 가구 썸네일은 UI 아이콘이 아니라 상품을 대신 보여 주는 그림이므로 `FurnitureThumb`에서 제품 색을 입혀 그립니다. 당근 브랜드 아이콘은 쓰지 않습니다.

### Wrapper contract

- wrapper 이름은 제품 역할을 드러내야 합니다.
- wrapper의 공개 props는 제품 언어를 사용합니다.
- wrapper는 SEED variant를 임의로 숨기거나 새 시각 스타일을 만들지 않습니다.
- 임의 헥스와 임의 간격과 임의 그림자를 추가하지 않습니다.
- wrapper 테스트는 키보드 조작과 disabled 상태와 포커스 이동을 포함합니다.

## Do's and Don'ts

### Do:

- **Do** 새 컴포넌트를 만들기 전에 [SEED 컴포넌트](https://seed-design.io/components)에 같은 목적이 있는지 먼저 확인합니다.
- **Do** 색 값 대신 semantic token을 사용합니다.
- **Do** 상태는 오렌지 하나로 표시하지 않고 의미에 맞는 critical과 informative과 positive token을 사용합니다.
- **Do** 도면 업로드와 3D 렌더러 실패와 저장 실패를 구체적인 다음 행동과 함께 설명합니다.
- **Do** 도트 로고를 헤더와 파비콘에만 사용합니다.
- **Do** AI slop 스캔 결과를 수정 명령이 아닌 검토 단서로 취급합니다.

### Don't:

- **Don't** 당근 로고와 마스코트와 서비스 문구를 코코로에 사용하지 않습니다.
- **Don't** 공개 SEED 컴포넌트를 다시 그려 유사한 자체 컴포넌트를 만들지 않습니다.
- **Don't** 그라데이션 글자와 유리 효과와 대형 그림자와 빛나는 상태 점을 기본값으로 사용하지 않습니다.
- **Don't** 모든 정보를 카드와 배지와 pill로 감싸지 않습니다.
- **Don't** 아이콘 대신 emoji를 사용하거나 모든 제목 위에 kicker를 반복하지 않습니다.
- **Don't** `단순한 X가 아니라 Y`처럼 내용 없는 대조 문장을 사용하지 않습니다.
- **Don't** 선택한 의도가 있는 자산을 scanner 탐지만으로 자동 삭제하지 않습니다.

### Sources

- [SEED Get Started](https://seed-design.io/get-started)
- [SEED React for Vite](https://seed-design.io/react/getting-started/installation/vite)
- [SEED Components](https://seed-design.io/components)
- [SEED Color](https://seed-design.io/foundations/color)
- [SEED Typography](https://seed-design.io/foundations/typography)
- [SEED Spacing](https://seed-design.io/foundations/spacing)
- [Kill AI Slop](https://github.com/yetone/kill-ai-slop)
