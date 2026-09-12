# Kokoro Backend

코코로의 좌석 예약과 착석과 집중 세션과 실시간 사용자 상태를 관리하는 NestJS 애플리케이션입니다.

## 실행

```bash
cp .env.example .env
pnpm install
pnpm start:dev
```

## 검증

```bash
pnpm lint
pnpm test --runInBand
pnpm test:e2e --runInBand
pnpm build
```

## 상태 확인

```bash
curl http://localhost:3000/api/health
```

예약과 착석 상태는 클라이언트 입력을 그대로 신뢰하지 않습니다. 서버가 현재 예약과 좌석 상태를 검사한 뒤 변경을 확정합니다.
