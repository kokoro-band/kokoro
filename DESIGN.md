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
  screen-title:
    fontFamily: "Pretendard Variable, Pretendard, sans-serif"
    fontSize: "1.625rem"
    fontWeight: 700
    lineHeight: "2.1875rem"
  title:
    fontFamily: "Pretendard Variable, Pretendard, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: "1.6875rem"
  body:
    fontFamily: "Pretendard Variable, Pretendard, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: "1.5rem"
  label:
    fontFamily: "Pretendard Variable, Pretendard, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: "1.1875rem"
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

> 이 문서는 2026년 9월 23일 구현을 기준으로 한 현재 규격입니다. 새 UI도 이 규칙을 따르며 세부 전환 기록과 검증 기준은 [`docs/design-system/seed-adoption.md`](docs/design-system/seed-adoption.md)를 따릅니다.

## Overview

**Creative North Star: "따뜻한 공간 도구"**

코코로는 당근의 제품 디자인 시스템인 SEED v2를 화면 UI의 기본 언어로 사용합니다. 색상과 타이포그래피와 간격은 SEED의 역할 기반 토큰을 따르고 대화형 컴포넌트는 가능한 한 SEED React를 직접 사용합니다. 당근의 로고와 마스코트와 서비스 문구는 복제하지 않습니다.

화면의 중심은 여전히 사용자가 꾸미는 방입니다. UI는 콘텐츠와 3D 공간을 방해하지 않는 중립 배경을 사용하며 주요 행동과 현재 선택에만 따뜻한 오렌지를 사용합니다. 그라데이션과 유리 효과와 과한 카드 장식은 제거합니다.

**Key Characteristics:**

- SEED v2 컴포넌트와 토큰 우선
- 주요 행동에만 사용하는 따뜻한 오렌지
- 방과 가구를 먼저 보여 주는 작업 도구 구조
- Pretendard Variable과 역할 기반 타이포그래피
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

**Display Font:** Pretendard Variable

**Body Font:** Pretendard Variable. 폰트가 로드되지 않으면 SEED 기본 시스템 글꼴로 대체합니다.

**Character:** 글꼴은 브랜드를 과시하기보다 사용자의 도면과 가구 정보를 맑게 전달해야 합니다.

### Hierarchy

- **Screen title:** 프로젝트 제목과 전체 화면 제목에 `screenTitle`을 사용합니다.
- **Title:** 패널 제목과 선택한 가구 제목에 `t7Bold` 수준을 사용합니다.
- **Body:** 읽어야 하는 설명은 `t5Regular` 또는 `articleBody`를 사용합니다.
- **Label:** 버튼과 필드와 짧은 상태는 `t4Medium`을 기본으로 사용합니다.
- **Minimum:** 핵심 정보는 `t4`보다 작게 표시하지 않습니다. `t1`부터 `t3`까지는 부가 메타데이터에만 사용합니다.

**The Scale Before Color Rule.** 제목과 본문의 차이는 먼저 크기와 두께와 간격으로 만듭니다. 단어에 별도 색이나 그라데이션을 입혀 강조하지 않습니다.

## Layout

데스크톱은 가구 라이브러리와 3D 편집기와 어시스턴트를 한 화면에 보여 줍니다. 편집 영역이 가장 넓은 공간을 차지합니다. 작은 화면에서는 3D 공간을 먼저 보여 주고 선택 도구는 `Bottom Sheet`나 이어진 콘텐츠로 전환합니다.

페이지 구성은 4px 리듬을 기본으로 합니다. SEED 컴포넌트 레시피가 2px과 6px과 10px 같은 반 단계 토큰을 사용하면 그 값을 그대로 유지합니다. 앱 레이아웃에서 임의의 픽셀 값을 추가하지 않습니다.

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

| 코코로 UI | SEED 기본 | 적용 방식 |
|---|---|---|
| 저장과 내보내기와 WebXR 진입 | Action Button | 직접 사용 |
| 2D와 3D와 WebXR 전환 | Segmented Control | 직접 사용 |
| 가구와 도면 전환 | Tabs | 직접 사용 |
| 가구 종류 필터 | Chip Toggle | 직접 사용 |
| 가구 목록 | List와 Image Frame | 기존 카드 그리드를 제거하고 조합 |
| 프로젝트 생성 | Dialog와 Text Field와 Action Button | 직접 사용 |
| 도면 첨부 | Attachment Field | 필요한 파일 검증만 wrapper에 주입 |
| 로딩과 변환 진행 | Progress Circle과 Skeleton | 상태에 따라 직접 사용 |
| 저장 결과와 짧은 피드백 | Snackbar | 직접 사용 |
| 오류와 안내 | Callout과 Page Banner와 Result Section | 오류 범위에 맞게 선택 |
| 가구 속성 | Slider와 Switch와 Select와 Text Field | 직접 사용 |
| 데스크톱 속성 패널 | Side Panel | 직접 사용 |
| 모바일 속성 패널 | Bottom Sheet | 직접 사용 |
| 편집 툴바와 치수 HUD | SEED primitive 조합 | `SpatialViewportToolbar`와 `DimensionRulerHUD` wrapper |

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
