# 코코로 리모델링 스튜디오

코코로는 2D, 3D, VR로 확인하는 리모델링 플랫폼입니다.

[라이브 데모](https://kokoro-band.github.io/kokoro/)

## 빠른 시작

### 프론트엔드 (로컬 데모)

서버와 DB 없이 브라우저 저장소로 바로 실행 가능합니다.

```bash
cd frontend
vp install
vp dev
```

기본 주소는 `http://localhost:5173`입니다.

### 백엔드 (서버 저장 모드)

Java 17+ 및 Docker가 필요합니다.

```bash
cd backend
docker compose up -d
./mvnw spring-boot:run
```

```bash
cd frontend
VITE_API_MODE=server VITE_API_BASE_URL=http://localhost:8080/api vp dev
```

## 검증

```bash
# 프론트엔드
cd frontend && vp check && vp test

# 백엔드
cd backend && ./mvnw test
```

## 문서

- [AGENTS.md](AGENTS.md): 작업 안내, 함정, 검증 및 PR 기준
- [DESIGN.md](DESIGN.md): SEED v2 UI 규칙과 주의사항
- [docs/development.md](docs/development.md): 환경 변수, Playwright E2E, 로컬 AI(Ollama/WebGPU), Pages 미리보기
- [docs/contracts/README.md](docs/contracts/README.md): 웹과 서버의 공유 계약 (`RoomModel`, 가구 카탈로그, API/버전 경계)
- [docs/webxr.md](docs/webxr.md): WebXR 지원 기기, 조작, Quest 디버깅
