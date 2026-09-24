# AI Slop 제거 운영 기준

## 목적

이 문서는 코코로의 화면이 AI 생성 템플릿처럼 보이는 패턴을 찾고 제거하는 검토 절차를 정의합니다. [Kill AI Slop](https://github.com/yetone/kill-ai-slop)의 원칙과 scanner를 참고하지만 탐지 결과를 자동 수정 명령으로 사용하지 않습니다.

## 핵심 원칙

1. 장식하기 전에 의도를 정합니다.
2. 주요 강조색과 제품의 목소리는 하나로 유지합니다.
3. 정보 계층은 색 장식보다 크기와 간격으로 만듭니다.
4. 추가하기 전에 불필요한 요소를 제거합니다.
5. 문구는 강한 표현보다 구체적인 정보를 우선합니다.
6. 아이콘과 배지가 있다면 전달하는 의미가 있어야 합니다.

## 적용 범위

기본 스캔 대상은 `frontend/src`입니다.

제외 대상은 다음과 같습니다.

- `node_modules`
- `dist`
- `build`
- `.git`
- lockfile
- 압축된 파일
- `frontend/seed-design`에 CLI가 생성한 원본 컴포넌트
- `frontend/public/models`의 3D 자산

코코로 wrapper와 feature 컴포넌트는 스캔 대상입니다.

## 표준 흐름

### 1. Scan

이 단계는 읽기 전용입니다. 구현 시점에 상류 저장소의 skill을 설치하거나 scanner만 받아 실행합니다.

```bash
node skill/scripts/scan.mjs frontend/src
node skill/scripts/scan.mjs frontend/src --json
```

scanner는 파일을 수정하지 않습니다. 결과는 검토 위치를 찾는 단서입니다.

### 2. Triage

각 탐지를 직접 읽고 다음 세 종류로 분류합니다.

| 분류 | 의미 | 처리 |
|---|---|---|
| Slop | 의도 없는 AI 기본 패턴 | 수정 후보 |
| Intentional | 제품 의도가 문서화된 자산과 표현 | 유지 |
| False positive | 기능이나 플랫폼 제약에 의한 탐지 | 제외 이유 기록 |

도트 로고는 의도된 코코로 자산으로 분류합니다. 헤더와 파비콘 외 패널에 픽셀 캐릭터나 장식 일러스트를 반복하면 Slop으로 다시 분류합니다.

### 3. Report

수정 전에 다음 형식의 보고서를 이슈에 남깁니다.

```text
slop  path/to/file:line  gradient text       -> solid foreground and type scale
slop  path/to/file:line  nested cards        -> one surface and dividers
keep  path/to/file:line  Kokoro pixel mark   -> documented brand asset

2 groups, 5 confirmed hits, 1 intentional exception
```

보고서에는 다음 항목이 필요합니다.

- 탐지 규칙 이름
- 파일과 줄
- Slop으로 판정한 이유
- 기능을 보존하는 최소 수정안
- Intentional과 false positive를 유지하는 이유

### 4. Approve

스캔 결과만으로 수정하지 않습니다. 이슈에서 수정할 그룹과 유지할 예외를 확정한 뒤 시작합니다.

### 5. Minimal fix

- 공통 token과 컴포넌트를 먼저 수정합니다.
- 복사된 개별 스타일을 무작정 수정하지 않습니다.
- 문구의 의미와 제품 기능을 바꾸지 않습니다.
- 하나의 PR은 하나의 승인된 수정 범위만 담습니다.
- 수정 후 scanner를 다시 실행하고 남은 예외를 기록합니다.

## 코코로의 주요 검토 항목

### 색상과 효과

- 남색에서 보라색으로 이어지는 그라데이션을 사용하지 않습니다.
- 그라데이션 글자와 배경 빛번짐을 사용하지 않습니다.
- 유리 효과와 빛나는 카드와 짙은 그림자를 사용하지 않습니다.
- 오렌지를 정보와 성공과 위험 상태에 공통으로 사용하지 않습니다.

### 형태와 밀도

- 모든 표면을 카드로 만들지 않습니다.
- 카드 안에 다시 카드를 반복하지 않습니다.
- 모든 라벨을 badge와 pill로 만들지 않습니다.
- 카테고리 필터처럼 pill이 의미를 갖는 경우에만 Chip을 사용합니다.
- 제목이 두 줄로 길어지면 크기를 키우기 전에 문구를 줄입니다.

### 아이콘과 자산

- emoji를 UI 아이콘으로 사용하지 않습니다.
- 아이콘을 같은 색의 파스텔 타일에 반복해 넣지 않습니다.
- 도트 로고는 헤더와 파비콘에만 사용합니다.
- scanner가 SVG를 탐지하면 아이콘의 제작 출처와 접근성 라벨과 필요성을 검토합니다.

### 타이포그래피와 문구

- 제목마다 영문 대문자 kicker를 붙이지 않습니다.
- 수치를 강조하기 위해 근거 없는 통계를 만들지 않습니다.
- `01 / 02 / 03`과 같은 장식용 섹션 번호를 사용하지 않습니다.
- `단순히 X가 아니라 Y`와 같은 자동 생성 티가 나는 대조 문장을 피합니다.
- `혁신적인`과 `강력한`과 `완벽한`처럼 검증 없는 형용사를 쓰지 않습니다.
- 에러 문구는 문제의 대상과 사용자가 할 수 있는 다음 행동을 함께 적습니다.

## 예외 규칙

의도된 예외는 코드 주석으로 무작정 숨기지 않습니다. 먼저 이슈나 보고서에 이유를 기록합니다. scanner 예외가 필요하면 가장 좁은 규칙 ID와 파일에만 `deslop-ignore-next-line <id>`를 사용합니다.

## 완료 기준

- 스캔 결과가 보고서에 남습니다.
- 각 탐지가 Slop과 Intentional과 False positive 중 하나로 분류됩니다.
- 승인된 그룹만 수정합니다.
- 기능과 접근성과 문구의 의미가 보존됩니다.
- 수정 후 다시 스캔하고 남은 예외를 기록합니다.
- 데스크톱과 모바일 화면을 각각 한 번씩 시각적으로 검증합니다.

## 2026년 9월 23일 적용 기록

- `frontend/src`의 50개 파일을 scanner로 확인했습니다.
- 상태 표시 점의 원형 radius 한 건이 탐지됐습니다.
- 상태를 알리는 의도된 형태로 분류했고 임의 값 대신 SEED radius token을 사용하도록 정리했습니다.
- 그라데이션과 유리 효과와 대형 그림자와 장식용 blur는 작업 화면에서 발견되지 않았습니다.
- 데스크톱 1440px과 모바일 390px에서 화면을 확인했습니다.

## 2026년 9월 24일 적용 기록

- `frontend/src`의 44개 파일을 scanner로 다시 확인했고 탐지 결과는 0건입니다.
- 헤더의 부제와 접속 상태와 아바타를 제거하고 프로젝트 이름과 주요 행동만 남겼습니다.
- 가구 카드의 설명과 규격과 추가 아이콘을 제거하고 이름과 가격을 보여 주는 목록으로 바꿨습니다.
- 장면 하단의 설명 카드와 어시스턴트의 캐릭터와 반복 상태 문구를 제거했습니다.
- 도트 로고는 헤더와 파비콘에만 남겼습니다.
- Pretendard Variable을 로컬 의존성으로 제공해 SEED 글꼴 스택을 운영체제와 관계없이 적용했습니다.
- 데스크톱 1440px과 모바일 390px에서 화면과 가로 넘침을 확인했습니다.

## 비범위

- kill-ai-slop skill을 저장소 의존성으로 설치하지 않습니다.
- scanner 결과만으로 소스 코드를 자동 수정하지 않습니다.
- 의도된 도트 로고와 3D 자산을 자동 삭제하지 않습니다.

## 참고

- [Kill AI Slop 저장소](https://github.com/yetone/kill-ai-slop)
- [Kill AI Slop Skill](https://raw.githubusercontent.com/yetone/kill-ai-slop/main/skill/SKILL.md)
- [Kokoro SEED Design System](../../DESIGN.md)
