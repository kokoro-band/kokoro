# Kokoro Frontend

코코로의 좌석 예약과 세션 기록과 Unity Web 실행을 담당하는 웹 애플리케이션입니다.

## 실행

```bash
pnpm install
pnpm dev
```

## 검증

```bash
pnpm lint
pnpm typecheck
pnpm build
```

## UI 원칙

- shadcn/ui 컴포넌트를 프로젝트 토큰에 맞춰 사용합니다.
- 초록색은 주요 행동과 선택 상태에만 사용합니다.
- 버튼은 각진 형태를 유지합니다.
- 카메라와 마이크를 허용하지 않아도 핵심 흐름을 사용할 수 있어야 합니다.
