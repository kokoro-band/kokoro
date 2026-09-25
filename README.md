# 코코로 리모델링 스튜디오

도면을 3D 공간으로 바꾸고 대화로 가구를 배치한 뒤 일반 웹 화면과 웹 VR에서 직접 위치를 조절하는 리모델링 플랫폼 MVP입니다.

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
- Spring Boot 프로젝트와 도면과 배치 명령 API

도면 자동 인식과 실제 제품 가격 연동과 생성형 AI는 외부 시스템이 필요한 다음 단계입니다. 로컬 데모의 도면 업로드는 예제 방 구조를 보여 줍니다. 서버 모드에서는 업로드 처리 상태를 확인한 뒤 사용자가 구조 화면에서 방 구조를 구성합니다.

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

Java 17 이상이 필요합니다. 저장소에 포함된 Maven Wrapper가 필요한 Maven을 내려받습니다.

```bash
cd backend
./mvnw spring-boot:run
```

기본 주소는 `http://localhost:8080`입니다. 상태 확인은 `GET /api/health`를 사용합니다.

## 검증

```bash
cd frontend
vp check
vp run build

cd ../backend
./mvnw test
./mvnw package
```

WebXR은 지원 헤드셋과 브라우저와 보안 연결이 필요합니다. VR 모드는 별도 앱 설치 없이 프론트엔드의 같은 프로젝트 화면에서 시작합니다.
