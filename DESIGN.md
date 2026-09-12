---
name: Kokoro
description: 자리 선택과 집중 상태를 하나의 운영 흐름으로 보여주는 온라인 스터디 공간
colors:
  brand-green: "#00de5a"
  ink: "#17191d"
  body: "#666c75"
  label: "#4a4e57"
  background: "#ffffff"
  floor: "#f5f5f2"
  table: "#e6e7e3"
  line: "#dfe1e4"
  disabled: "#9fa1a7"
  warning: "#ffb020"
  away: "#fff7df"
typography:
  display:
    fontFamily: "Geist Variable, Noto Sans KR Variable, Malgun Gothic, sans-serif"
    fontSize: "clamp(2.4rem, 4.4vw, 3.7rem)"
    fontWeight: 900
    lineHeight: 0.96
    letterSpacing: "-0.04em"
  title:
    fontFamily: "Geist Variable, Noto Sans KR Variable, Malgun Gothic, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 900
    lineHeight: 1.3
    letterSpacing: "-0.03em"
  body:
    fontFamily: "Geist Variable, Noto Sans KR Variable, Malgun Gothic, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
  label:
    fontFamily: "Geist Variable, Noto Sans KR Variable, Malgun Gothic, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: 1.4
rounded:
  square: "0"
  control: "2px"
  surface: "4px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "28px"
  section: "40px"
components:
  button-primary:
    backgroundColor: "{colors.brand-green}"
    textColor: "{colors.ink}"
    rounded: "{rounded.square}"
    height: "44px"
    padding: "0 20px"
  seat-selected:
    backgroundColor: "{colors.brand-green}"
    textColor: "{colors.ink}"
    rounded: "{rounded.square}"
    height: "48px"
    padding: "0 12px"
  floor-container:
    backgroundColor: "{colors.floor}"
    textColor: "{colors.ink}"
    rounded: "{rounded.square}"
    padding: "40px"
---

# Design System: Kokoro

## Overview

**Creative North Star: "조용한 좌석 관제판"**

코코로의 화면은 장식적인 메타버스 포스터가 아니라 현재 선택과 공간 상태를 빠르게 판단하는 운영 도구에 가깝습니다. 흰 캔버스와 검은 물성을 기본으로 삼고 전기 초록은 사용자가 지금 내린 결정에만 사용합니다.

데스크톱에서는 왼쪽의 예약 판단과 오른쪽의 좌석 지도가 동시에 보여야 합니다. 모바일에서는 예약 판단과 주요 동작을 먼저 완료한 뒤 지도를 탐색합니다.

**Key Characteristics:**

- 낮은 반경과 직각의 기능적인 조형
- 상태를 보조하는 절제된 전기 초록
- 좌석 선택과 예약 요약을 잇는 선형 피드백
- 한국어 화면에서도 무게감을 유지하는 굵은 제목

## Colors

팔레트는 무채색 운영 화면을 기본으로 하고 초록과 주황을 상태 신호로만 사용합니다.

### Primary

- **집중 초록**: 선택된 좌석과 주요 동작과 연결선에 사용합니다.

### Neutral

- **잉크**: 제목과 선택된 시간처럼 가장 강한 정보에 사용합니다.
- **바디와 라벨**: 설명과 보조 정보의 단계를 나누되 흰 배경에서 충분한 대비를 유지합니다.
- **플로어와 테이블**: 음영 대신 톤 차이로 3D 공간의 구역을 구분합니다.

**The One Green Decision Rule.** 초록은 한 화면에서 현재 선택과 다음 주요 동작을 설명하는 데만 사용합니다.

## Typography

**Display Font:** Geist Variable with Noto Sans KR Variable fallback

**Body Font:** Geist Variable with Noto Sans KR Variable fallback

영문과 숫자의 밀도는 Geist가 담당하고 한국어 글리프는 Noto Sans KR이 담당합니다. 제목은 짧고 무겁게 쓰고 본문은 작은 크기에서도 읽히는 행간을 유지합니다.

### Hierarchy

- **Display**: 최상위 예약 질문에만 사용합니다.
- **Title**: 공간과 구역의 이름에 사용합니다.
- **Body**: 이용 규칙과 현재 상태를 설명합니다.
- **Label**: 시간과 좌석과 범례처럼 빠른 스캔이 필요한 정보에 사용합니다.

**The Heavy Question Rule.** 최상위 질문은 큰 크기와 가장 두꺼운 무게를 사용하되 한 화면에 한 번만 등장합니다.

## Layout

최대 너비는 1440px입니다. 데스크톱은 최대 360px의 예약 열과 나머지 너비를 쓰는 지도 열로 나눕니다. 두 열 사이는 64px을 기본으로 합니다. 1024px 미만에서는 예약 영역과 지도를 세로로 배치하고 예약 버튼을 지도보다 먼저 보여줍니다.

간격은 8px을 최소 단위로 삼습니다. 제어 사이는 8px에서 12px을 쓰고 블록 사이는 20px에서 40px을 쓸 수 있습니다.

## Elevation & Depth

화면은 평면을 기본으로 합니다. 바닥과 테이블은 배경 톤으로 구분하고 음영은 정보 카드처럼 실제로 떠 있는 보조 요소에만 사용합니다. 기본 음영은 `0 2px 8px rgb(0 0 0 / 0.08)`입니다.

**The Flat Operations Rule.** 구조는 선과 톤으로 보여주고 음영을 장식으로 사용하지 않습니다.

## Shapes

좌석과 시간 선택과 주요 버튼은 직각을 기본으로 합니다. 표면에 반경이 필요한 경우에도 4px을 넘지 않습니다. 상태는 둥근 배지보다 작은 정사각형 표시와 1px 경계선으로 나타냅니다.

## Components

### Buttons

- **Shape:** 직각의 44px 높이를 기본으로 합니다.
- **Primary:** 집중 초록 배경과 잉크 글자를 사용합니다.
- **Hover / Focus:** 호버는 초록을 어둡게 조정하고 포커스는 초록 3px 외곽선을 보여줍니다.

### Chips

시간 선택은 1px 경계선의 흰 배경을 기본으로 하고 선택되면 잉크 배경과 흰 글자로 반전합니다.

### Cards / Containers

지도 컨테이너는 플로어 배경과 1px 경계선을 사용합니다. 개별 좌석은 흰 배경이며 선택되면 초록으로 전환합니다. 사용 중은 회색으로 비활성화하고 자리 비움은 따뜻한 크림 배경과 작은 주황 표시로 구분합니다.

### Selection Connector

데스크톱에서는 선택 요약에서 실제 좌석까지 초록 점선을 연결합니다. 좌석을 바꾸면 선의 끝점도 즉시 이동합니다. 모바일에서는 선을 숨기고 지도 안의 짧은 선택 레일로 대체합니다.

## Do's and Don'ts

### Do:

- **Do** 초록으로 현재 선택과 주요 동작의 관계를 보여줍니다.
- **Do** 좌석 상태를 색상과 텍스트와 비활성 상태로 함께 전달합니다.
- **Do** 모바일에서 예약 판단과 주요 동작을 지도보다 먼저 배치합니다.

### Don't:

- **Don't** 여러 강조색을 추가해 초록의 상태 의미를 약하게 만들지 않습니다.
- **Don't** 큰 반경과 강한 음영을 장식적으로 반복하지 않습니다.
- **Don't** 카메라나 마이크 사용을 필수 조건처럼 표현하지 않습니다.
