# 코코로 리모델링 스튜디오

직접 만든 공간이나 도면 이미지에서 얻은 초안에 가구를 배치하고 2D와 3D와 웹 VR에서 확인하는 리모델링 플랫폼 MVP입니다. 도면 초안은 사용자가 실제 집에 맞게 보정합니다.

프론트엔드와 백엔드는 하나의 Git 저장소에 있지만 각각 독립적으로 실행합니다. 2D 편집과 일반 3D 미리보기와 VR은 모두 같은 웹 프론트엔드에서 실행합니다.

## 현재 구현 범위

- PDF와 PNG와 JPG 도면 업로드 및 형식 검증
- 도면 변환 상태와 공간 치수 표시
- 구조와 배치와 내역 세 화면을 앱 바 한 곳에서 전환
- 도면 이미지에서 방 배치 초안 만들기와 방 나누기와 합치기와 문과 창 편집
- 집 전체와 방 하나 사이를 오가는 배치 화면과 미니맵 이동
- 방별 가구 목록과 예제 카탈로그 기준 전체 예상 비용
- Three.js 기반 2D 도면 보기와 일반 3D 방 편집
- 가구 카탈로그와 추가와 선택과 이동과 회전과 삭제
- 자연어 명령을 이용한 가구 배치
- 같은 웹 주소에서 실행되는 WebXR VR 진입과 컨트롤러 배치
- 실행 취소와 다시 실행과 자동 저장과 JSON 내보내기
- 화면 전환과 구조 편집과 가구 조작 키보드 단축키, `?` 키로 여는 단축키 안내
- Spring Boot 프로젝트와 도면과 배치 명령 API

현재 코드의 범위와 남은 작업은 [개발 실행 계획 #52](https://github.com/kokoro-band/kokoro/issues/52)에서 관리합니다.

| 영역 | 구현된 내용 | 남은 내용 |
|---|---|---|
| 공간 | 전용면적 입력, 방 나누기와 합치기, 문과 창 편집 | 웹과 서버 공간 JSON 검증 #53 및 구조 검증 #55 |
| 이미지 초안 | 브라우저의 도면 이미지 분석과 사용자 보정 | 실제 도면 평가 #68 및 OCR 연구 |
| 가구 | GLB 모델 로딩과 배치 및 조작 | 공통 규격 #57 및 내부 벽 충돌 보완 #8 |
| 저장 | PostgreSQL과 Flyway, 서버 모드 저장과 조회 | 저장 요청 순서와 복구 #56 |
| 도면 파일 | 서버 로컬 파일 저장과 비동기 데모 작업 상태 | 작업 복구 #4 및 운영 파일 저장소 |
| 자연어 | 규칙 기반 배치 명령 | 대상 선택과 확인 #9 및 로컬 모델 평가 #61 |
| 접근 | 운영 JWT 검사와 프로젝트 소유권 및 삭제 API, 도면 작업 조회 권한 | 보존 정책 #12 및 로그인 화면 |

구조 화면의 이미지 분석은 수정할 수 있는 초안을 만듭니다. 프로젝트 메뉴에서 별도로 올리는 도면 파일은 로컬 데모에서 예제 방을 표시합니다. 서버 모드에서는 업로드 작업이 `READY`가 되어도 벽이나 문을 인식한 것은 아닙니다. PDF에서 공간을 자동 추출하지 않으며 상용 제품의 정확한 모델과 가격 및 재고도 제공하지 않습니다.

## 프로젝트 구조

```text
.
├── frontend/   React와 TypeScript와 Vite+와 Three.js와 WebXR
├── backend/    Java 17과 Spring Boot 4.1.1
├── docs/       시스템 구조와 API와 WebXR 계약
├── PRODUCT.md  제품 범위와 단계
└── DESIGN.md   구현된 디자인 원칙
```

## 프론트엔드 실행

```bash
cd frontend
vp install
vp dev
```

기본 주소는 `http://localhost:5173`입니다. 별도 설정이 없으면 모든 기능이 브라우저 안에서 동작하는 로컬 데모로 실행됩니다.

Spring 서버에 연결하려면 `frontend/.env.example`을 참고해 `VITE_API_MODE=server`를 설정합니다.

## 백엔드 실행

Java 17 이상과 실행 중인 Docker가 필요합니다. 저장소의 Maven Wrapper와 PostgreSQL Compose 구성을 사용합니다.

```bash
cd backend
docker compose up -d
./mvnw spring-boot:run
```

기본 주소는 `http://localhost:8080`입니다. 상태 확인은 `GET /api/health`를 사용합니다. DB 연결과 파일 경로 및 인증 설정은 [백엔드 실행 문서](backend/README.md)에 있습니다.

다른 터미널에서 아래와 같이 프론트를 실행하면 Spring과 연결됩니다. 기본 로컬 데모는 DB 없이 실행되지만 이 서버 모드는 PostgreSQL이 필요합니다.

```bash
cd frontend
vp install
VITE_API_MODE=server VITE_API_BASE_URL=http://localhost:8080/api vp dev
```

## 검증

새 기능과 버그 수정은 실패 테스트를 먼저 실행한 뒤 구현합니다. 동작별 검증 범위와 착수 순서는 [동작 테스트 계획](docs/qa/behavior-test-plan.md)에 정리했습니다. PR에는 RED와 GREEN 결과 및 미검증 항목을 남깁니다.

공개 데모의 배포 방법과 지원 범위는 [GitHub Pages 데모 안내](docs/github-pages-demo.md)를 참고합니다. main 통합 전까지 공개 화면은 기존 데모 커밋을 사용합니다.

```bash
cd frontend
vp check
vp test
vp run build

cd ../backend
./mvnw test
./mvnw package
```

WebXR은 지원 헤드셋과 브라우저와 보안 연결이 필요합니다. VR 모드는 별도 앱 설치 없이 프론트엔드의 같은 프로젝트 화면에서 시작합니다.
