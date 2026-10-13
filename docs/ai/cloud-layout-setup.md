# 외부 AI 배치 해석

로컬 데모의 AI 배치에서 `외부 AI로 해석`을 선택하면 Gemini가 한국어 문장을 한 가지 배치 의도로 바꿉니다. 배치 의도는 추가와 이동 및 회전처럼 실행할 동작과 대상 가구를 나타내는 JSON입니다. 작은 브라우저 모델을 다시 실행하지 않으며 기존 배치 엔진이 공간과 충돌을 계산합니다. 사용자가 제안을 적용해야 브라우저에 저장합니다.

## 실행

Java 17과 Docker 및 Vite+가 필요합니다. [Google AI Studio](https://aistudio.google.com/apikey)에서 사용할 API 키를 준비하고 서버 실행 환경에만 `GEMINI_API_KEY`로 설정합니다. 기본 모델은 `gemini-3.1-flash-lite`이며 `GEMINI_MODEL`로 바꿀 수 있습니다. 다른 모델은 같은 JSON 출력 기능을 지원하는지 먼저 확인합니다.

백엔드 폴더에서 `.env.example`을 `.env`로 복사하고 API 키를 입력합니다. Spring은 이 파일을 자동으로 읽지 않으므로 실행 셸에 불러옵니다. `.env`는 Git에 포함하지 않습니다.

```bash
cd backend
cp -n .env.example .env
# 편집기로 .env의 GEMINI_API_KEY를 입력합니다.
set -a
source .env
set +a
docker compose up -d
./mvnw spring-boot:run
```

다른 터미널에서 브라우저 저장 모드로 웹을 시작합니다.

```bash
cd frontend
vp install
VITE_API_MODE=local VITE_API_BASE_URL=http://localhost:8080/api vp dev
```

`http://localhost:5173`에서 배치 화면의 AI 배치를 열고 `외부 AI로 해석`을 선택합니다. 예를 들어 `소파 옆에 화분 하나 놔줘`를 보내면 기준 가구를 확인한 제안을 검토할 수 있습니다. 기존 가구가 같은 종류로 여러 개면 변경할 하나를 선택합니다. 회전은 절대각을 사용하며 여러 동작을 한 문장에 요청하는 기능은 지원하지 않습니다.

## 전송과 실패 처리

웹은 요청 문장과 현재 가구의 카탈로그 ID 및 이름만 서버에 보냅니다. 서버는 공통 카탈로그를 추가해 Gemini로 전달합니다. 공간 좌표와 도면 원본 및 인증 토큰은 제공자에게 보내지 않습니다. `VITE_` 환경 변수에는 API 키를 넣지 않습니다.

JSON Schema는 허용 필드와 자료형을 정의한 규격입니다. 제공자에게 [출력 규격](../contracts/cloud-layout-intent.schema.json)을 보내고 서버와 웹에서 결과를 다시 검사합니다. 응답에 좌표나 알 수 없는 가구가 있거나 동작 조건이 맞지 않으면 제안을 만들지 않습니다.

키가 없으면 설정 오류를 안내합니다. 제공자 호출 한도와 잘못된 응답 및 8초 이상 지연에서도 기존 배치를 유지합니다. 요청 중단 뒤 늦게 도착한 응답은 버리고 입력을 다시 보낼 수 있습니다. 자동 재시도나 다른 AI로 전환은 하지 않으며 사용자가 규칙 기반을 직접 선택할 수 있습니다.

Gemini의 무료 사용량은 계정과 제공자 정책을 따릅니다. 이 코드는 계정의 무료 과금 여부를 판단하지 않습니다. [요금과 데이터 사용 정책](https://ai.google.dev/gemini-api/docs/pricing)과 [호출 한도](https://ai.google.dev/gemini-api/docs/rate-limits)를 확인한 계정을 사용합니다. 실제 한국어 해석 품질은 키를 설정한 뒤 별도로 평가해야 합니다.

## 검사

```bash
cd frontend
vp run test:e2e:cloud-ai --project=desktop
vp run test:e2e:cloud-ai --project=narrow
```

검사는 실제 웹과 Spring 및 임시 PostgreSQL을 실행합니다. 외부 제공자만 로컬 HTTP 서버로 대체하므로 실제 키와 과금이 필요하지 않습니다. 회전과 상대 배치 및 대상 선택과 승인 전 저장 보존 및 취소와 오류 뒤 재요청 및 늦은 응답 폐기를 검사합니다. 전체 저장 JSON을 비교하고 적용 후 새로고침도 확인합니다.

desktop은 1280px이며 narrow는 390px의 Chromium입니다. 실제 모바일 기기와 WebXR 헤드셋 검사는 포함하지 않습니다. GitHub Pages 데모의 실제 외부 호출에는 별도 서버와 API 주소 설정이 필요하며 이번 변경만으로 배포되지 않습니다.
