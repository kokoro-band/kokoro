# 코코로 (Kokoro)

마음이 모이는 곳과 내가 집중하는 여기라는 의미를 담은 3D 온라인 스터디 카페 프로젝트입니다. 좌석 예약과 3D 착석과 집중 상태를 하나의 흐름으로 연결합니다.

세 애플리케이션은 하나의 Git 저장소에 있지만 각각 독립적으로 실행합니다. 루트 워크스페이스와 공용 `package.json`은 사용하지 않습니다.

## 프로젝트 구조

```text
.
├── frontend/   React + TypeScript + Vite + shadcn/ui
├── backend/    NestJS API
├── unity/      Unity 6.3 LTS Web 프로젝트
├── docs/       API와 실시간 이벤트 계약
└── PRODUCT.md  제품 원칙과 범위
```

## 프론트엔드 실행

```bash
cd frontend
pnpm install
pnpm dev
```

기본 주소는 `http://localhost:5173`입니다.

## 백엔드 실행

```bash
cd backend
cp .env.example .env
pnpm install
pnpm start:dev
```

기본 주소는 `http://localhost:3000/api`입니다. 상태 확인은 `GET /api/health`를 사용합니다.

## Unity 실행

Unity Hub에서 `unity/` 폴더를 Unity `6000.3.23f1`로 엽니다. Web Build Support 모듈이 필요합니다. 프로젝트를 처음 열면 Unity가 기본 장면과 `.meta` 파일을 생성하므로 Unity 담당자가 한 번에 커밋합니다.

브라우저와 Unity 사이의 초기 실행 문맥은 `AppBootstrap` JSON으로 전달합니다. 필드 정의는 `docs/contracts/runtime-context.md`에 있습니다.

## 작업 원칙

- 각 담당자는 자신의 폴더에서 명령을 실행합니다.
- 예약과 착석과 세션 상태의 최종 판단은 백엔드가 담당합니다.
- API와 WebSocket 이벤트를 바꿀 때는 `docs/contracts/` 문서를 먼저 함께 수정합니다.
- Unity 바이너리 에셋은 Git LFS로 관리합니다.
- `.env`와 서비스 키는 커밋하지 않습니다.
