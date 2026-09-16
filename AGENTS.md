# 코코로 작업 규칙

## 제품 경계

코코로는 도면을 바탕으로 가구를 배치하고 2D와 3D와 웹 VR에서 같은 결과를 확인하는 리모델링 플랫폼이다.

- `frontend/`는 React와 Three.js로 2D와 3D와 WebXR을 모두 제공한다.
- `backend/`는 Java 17과 Spring Boot API를 제공한다.
- VR을 위한 별도 앱이나 Unity 클라이언트를 추가하지 않는다.
- 현재 구현과 예정 기능은 `README.md`와 `PRODUCT.md`를 기준으로 구분한다.

## 팀 역할

| 팀원 | 주요 영역 |
|---|---|
| 민섭 | 3D 장면과 WebXR와 가구 자산 |
| 영진 | 웹 프론트엔드 |
| 현민 | Spring 백엔드 |
| 만욱 | PM과 웹 프론트엔드 |

역할은 소유권을 표시하는 안내이며 이슈에 담당자를 미리 지정하는 규칙이 아니다. 작업을 시작하는 사람이 해당 이슈를 자기에게 할당한다.

## GitHub Issues 운영

1. 코드를 바꾸기 전에 이슈를 확인한다. 적합한 이슈가 없으면 기능이나 버그 템플릿으로 만든다.
2. 이슈는 기본적으로 비할당 상태로 두고 착수할 때만 자기 자신에게 할당한다.
3. 하나의 PR은 하나의 이슈를 완료하는 범위로 작게 유지한다.
4. 이슈에는 필요한 `area:*`와 `type:*`과 `priority:*` 라벨을 붙인다.
5. 완료 조건은 구현 항목이 아니라 사용자나 API에서 확인할 수 있는 결과로 적는다.

## 라벨 선택

- `frontend/**` 변경은 `area:frontend`를 사용한다.
- `RoomScene`과 WebXR과 3D 모델 변경은 `area:3d-vr`를 함께 사용한다.
- `backend/**` 변경은 `area:backend`를 사용한다.
- `PRODUCT.md`와 `DESIGN.md` 변경은 `area:product`를 사용한다.
- 문서 변경은 `area:docs`를 사용한다.
- GitHub Actions와 환경 설정과 빌드 도구 변경은 `area:infra`를 사용한다.

PR의 `area:*` 라벨은 변경 경로에 따라 자동으로 붙는다. 이슈는 생성할 때 직접 선택한다.

## 브랜치와 PR

- 사람이 만드는 브랜치는 `<type>/<issue-number>-<short-name>` 형식을 권장한다.
- Codex가 만드는 브랜치는 `codex/` 접두사를 사용한다.
- PR 제목은 `feat: 가구 배치 저장 추가`처럼 짧게 적는다.
- PR 본문에는 변경과 추가된 기능과 수정된 버그와 버그 원인과 검증만 적는다.
- 해당하지 않는 항목은 `없음`으로 표시하고 상세 구현 내역은 이슈와 코드에 남긴다.
- PR 본문은 일반적인 화면에서 스크롤 없이 읽히는 분량을 목표로 한다.

## 검증

프론트엔드를 변경했다면 다음 검증을 실행한다.

```bash
cd frontend
pnpm lint
pnpm typecheck
pnpm build
```

백엔드를 변경했다면 다음 검증을 실행한다.

```bash
cd backend
./mvnw test
./mvnw package
```

실제 WebXR 헤드셋 검증과 배포 확인은 로컬 빌드 검증과 구분해 PR에 적는다.
