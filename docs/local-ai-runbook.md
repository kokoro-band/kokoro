# 내 PC의 모델로 가구 배치하기

이 기능은 브라우저가 같은 PC의 Ollama에 한국어 요청을 보내고 Spring 서버가 배치할 좌표를 계산하는 방식입니다. 모델 다운로드에는 인터넷이 필요합니다. 다운로드 이후 명령 해석에는 외부 AI API를 사용하지 않습니다. 모델 응답에 좌표 계산이나 저장 권한을 맡기지 않습니다.

현재 통합 작업 브랜치는 `codex/local-ai-development`입니다. main에 아직 반영되지 않은 선행 PR을 포함합니다. 전체 저장소를 체크아웃해야 공통 규격 파일도 함께 빌드됩니다.

## 실행 준비

Java 17과 Docker 및 Vite+가 필요합니다. [Ollama 공식 설치 페이지](https://ollama.com/download)에서 운영체제에 맞는 프로그램도 설치합니다. 현재 모델은 `qwen3:4b`입니다. 검증 당시 모델 다운로드 크기는 약 2.5GB였습니다. 추론 메모리는 다운로드 크기보다 클 수 있으며 실제 속도는 PC에 따라 달라집니다.

아래 명령은 macOS와 Linux 터미널 기준입니다. 이미 실행한 Ollama가 11434 포트를 사용 중이면 그 프로세스의 설정을 확인합니다. 다른 프로세스를 강제로 종료하거나 같은 포트에 서버를 중복 실행하지 않습니다.

```bash
OLLAMA_HOST=127.0.0.1:11434 OLLAMA_NO_CLOUD=1 OLLAMA_ORIGINS=http://127.0.0.1:5175 ollama serve
```

별도 터미널에서 모델을 받습니다.

```bash
ollama pull qwen3:4b
ollama list
```

허용할 웹 주소는 실제로 사용하는 주소로 바꿉니다. `*`로 모든 사이트를 허용하거나 Ollama를 외부 네트워크에 공개하지 않습니다. 환경 변수 변경 후에는 Ollama를 재시작해야 합니다. Windows에서 환경 변수를 설정하는 방법은 [공식 FAQ](https://docs.ollama.com/faq)를 따릅니다.

## 테스트 DB와 서버

운영 DB가 아닌 개발 전용 PostgreSQL을 사용합니다. 다음은 다른 서비스의 기본 포트와 겹치지 않는 예시입니다. 비밀번호는 로컬 테스트 전용입니다. 컨테이너와 볼륨이 이미 있으면 새로 만들지 말고 기존 설정을 먼저 확인합니다.

```bash
docker run --name kokoro-local-ai-db \
  -e POSTGRES_DB=kokoro \
  -e POSTGRES_USER=kokoro \
  -e POSTGRES_PASSWORD=kokoro-local-demo \
  -p 127.0.0.1:15432:5432 \
  -v kokoro-local-ai-data:/var/lib/postgresql/data \
  -d postgres:16-alpine
```

저장소의 `backend/`에서 실행합니다.

```bash
SERVER_ADDRESS=127.0.0.1 PORT=8081 \
DB_URL=jdbc:postgresql://127.0.0.1:15432/kokoro \
DB_USERNAME=kokoro DB_PASSWORD=kokoro-local-demo \
FRONTEND_ORIGIN=http://127.0.0.1:5175 \
./mvnw spring-boot:run
```

서버 시작 때 DB 변경과 가구 초기 등록이 실행됩니다. `GET /api/furniture-catalog`에서 사용 가능한 가구 8종을 확인합니다. 다시 시작해도 같은 ID를 중복 등록하지 않습니다.

공개 에셋의 전체 목록은 `docs/contracts/furniture-source-assets.json`에 있습니다. Kenney Furniture Kit의 GLB 140개에 대한 원본 경로와 해시를 확보했습니다. 실제 배치 카탈로그는 크기와 화면 연결을 준비한 8종입니다. 140종을 모두 선택할 수 있다는 뜻은 아닙니다. 치수와 가격은 화면 검증용 예제이며 실물 제품의 판매 정보가 아닙니다. 이용 조건과 원본 출처는 [Kenney 공식 페이지](https://kenney.nl/assets/furniture-kit)와 가구별 `provenance`에 기록했습니다.

## 웹 실행과 사용

저장소의 `frontend/`에서 실행합니다.

```bash
vp install
VITE_API_MODE=server VITE_API_BASE_URL=http://127.0.0.1:8081/api \
vp dev --host 127.0.0.1 --port 5175 --strictPort
```

1. `http://127.0.0.1:5175`를 모델이 설치된 PC의 브라우저에서 엽니다.
2. 새 프로젝트를 만들고 구조 화면에서 방을 저장합니다.
3. 배치 화면의 AI 배치를 엽니다. 좁은 화면에서는 아래쪽 AI 배치 버튼으로 패널을 엽니다.
4. 가구를 요청합니다. 화면에 미리보기가 나타나도 아직 DB에 저장된 것은 아닙니다.
5. 변경 설명을 확인하고 확인하고 저장을 누릅니다. 취소하면 기존 배치는 유지됩니다.
6. 새로고침해서 같은 프로젝트의 배치가 남아 있는지 확인합니다.

| 요청 예시 | 의미 |
|---|---|
| 클라우드 소파 하나 추가해줘 | 카탈로그의 소파 추가 |
| 소파 오른쪽에 올리브 화분 하나 놓아줘 | 실제 소파 위치를 기준으로 배치 |
| 선택한 가구를 오른쪽으로 50cm 옮겨줘 | 선택한 가구를 정확히 0.5m 이동 |
| 소파를 90도 돌려줘 | 소파 방향을 절대 각도 90도로 설정 |
| 의자 하나 삭제해줘 | 의자가 여럿이면 직접 대상을 선택 |
| 가구를 모두 삭제해줘 | 프로젝트 전체 가구의 삭제 미리보기. 확인해야 적용 |

왼쪽과 오른쪽 및 앞뒤는 화면 카메라가 아닌 공간 좌표 기준입니다. 창가와 문 근처 배치는 구조에 등록된 실제 창문과 문을 사용합니다. 없는 창문을 만들어 내지 않습니다. 제안은 5분 뒤 만료됩니다.

## 연결 문제와 복구

| 상태 | 할 일 |
|---|---|
| 로컬 모델이 없음 | `ollama pull qwen3:4b`로 모델을 설치합니다. |
| Ollama 연결 실패 | 실행 상태와 포트 및 허용 웹 주소를 확인합니다. 규칙 처리기로 자동 전환하지 않습니다. |
| 저장 실패 | 먼저 저장을 다시 시도합니다. 초안을 버려도 되는 경우에만 서버 저장본 불러오기를 누릅니다. |
| 확인 응답을 받지 못함 | 처리 상태 확인을 누릅니다. 같은 요청을 새로 만들어 중복 적용하지 않습니다. |
| 다른 편집으로 제안이 오래됨 | 최신 저장본을 확인한 뒤 새 요청을 만듭니다. |
| 안전한 배치를 못 찾음 | 다른 위치나 가구 수로 요청합니다. 제한된 탐색 실패이지 공간 전체에 해답이 없다는 뜻은 아닙니다. |

다른 PC나 휴대전화에서 접속하면 `127.0.0.1`은 그 기기 자신입니다. PC의 모델을 휴대전화에 자동으로 공유하지 않습니다. 이번 검증은 같은 PC의 브라우저를 대상으로 합니다. 배포된 HTTPS 페이지에서 로컬 모델에 접속하는 동작과 브라우저별 로컬 네트워크 권한은 별도 검증이 필요합니다. 브라우저 보안 설정을 끄도록 안내하지 않습니다.

## 개발 검증

일반 테스트는 모델 다운로드나 실행을 요구하지 않습니다.

```bash
cd frontend
vp check
vp test
vp run build
```

실제 모델 검사와 실제 서버까지 연결하는 검사는 명시적으로 실행합니다. 두 번째 명령은 위의 8081 개발 서버에 검증 프로젝트를 생성합니다. 운영 서버에서는 실행하지 않습니다.

```bash
KOKORO_LIVE_AI=1 vp test src/features/studio/local-ai.live.test.ts
KOKORO_LIVE_APP=1 vp test src/features/studio/local-ai.integration.live.test.ts
```

```bash
cd backend
./mvnw test
./mvnw package
```

서버 테스트는 Docker의 별도 PostgreSQL을 사용합니다. 실제 모델 테스트 통과는 검사한 문장에 대한 근거입니다. 임의의 한국어 요청 전체의 정확도를 보증하지 않습니다. WebXR 헤드셋과 운영 배포 검증도 별도입니다.
