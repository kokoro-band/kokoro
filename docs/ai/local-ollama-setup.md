# 로컬 Ollama 설정

코코로의 자연어 배치는 사용자 PC의 Ollama를 브라우저가 직접 호출합니다(#63). 서버나 외부 AI API는 쓰지 않습니다. 이 문서는 개발자 PC에서 모델을 준비하고 웹 화면이 접근할 수 있게 하는 절차입니다. 이 문서의 명령은 macOS 기준이며 공식 문서(FAQ)로 `launchctl` 설정과 기본 바인딩을 대조했지만 이 저장소에서 설치까지 실제로 실행해 검증한 것은 아닙니다. 확인이 필요한 항목은 아래에 따로 표시했습니다.

## 준비

Ollama를 설치한 뒤 모델을 받습니다.

```bash
ollama pull qwen3:4b
ollama list
```

Ollama는 기본으로 `127.0.0.1` 포트 `11434`에서 요청을 받습니다(공식 문서 기준). 아래 명령이 모델 목록을 반환하면 실행 중입니다.

```bash
curl http://127.0.0.1:11434/api/tags
```

## 웹 화면의 접근 허용

브라우저가 다른 주소의 화면에서 Ollama를 호출하려면 Ollama가 그 주소(origin)를 허용해야 합니다. 공식 문서는 기본으로 `127.0.0.1`과 `0.0.0.0` origin의 요청을 허용한다고 안내합니다. 그 밖의 주소는 환경 변수 `OLLAMA_ORIGINS`에 쉼표로 적어 허용합니다. 허용할 주소는 화면을 여는 주소와 정확히 같아야 하며, 모든 주소를 허용하는 `*`는 쓰지 않습니다.

| 화면 | 주소 |
|---|---|
| 로컬 개발 | `http://localhost:5173` |
| 공개 데모 | `https://kokoro-band.github.io` |

macOS 앱으로 실행하는 경우 다음처럼 설정하고 Ollama 앱을 종료한 뒤 다시 실행합니다.

```bash
launchctl setenv OLLAMA_ORIGINS "http://localhost:5173,https://kokoro-band.github.io"
```

터미널에서 직접 실행하는 경우는 다음과 같습니다.

```bash
OLLAMA_ORIGINS="http://localhost:5173,https://kokoro-band.github.io" ollama serve
```

## 허용 확인

브라우저 없이도 허용 여부를 확인할 수 있습니다. 응답 헤더에 `Access-Control-Allow-Origin`이 요청한 주소로 돌아오면 허용된 것입니다.

```bash
curl -i -X OPTIONS http://127.0.0.1:11434/api/chat \
  -H "Origin: https://kokoro-band.github.io" \
  -H "Access-Control-Request-Method: POST"
```

## 막혔을 때 확인할 항목

1. `curl http://127.0.0.1:11434/api/tags`가 응답하는지 확인합니다. 응답이 없으면 Ollama가 실행 중이 아닙니다.
2. `ollama list`에 `qwen3:4b`가 있는지 확인합니다. 없으면 화면은 모델 미설치로 안내해야 합니다.
3. 위 `curl -i -X OPTIONS` 응답에 허용 헤더가 없으면 `OLLAMA_ORIGINS`에 화면 주소가 없거나 설정 뒤 Ollama를 다시 실행하지 않은 것입니다.
4. 주소는 스킴과 포트까지 정확히 같아야 합니다. `http://localhost:5173`과 `http://127.0.0.1:5173`은 다른 주소입니다.
5. 공개 데모는 https 화면이 http 주소를 호출합니다. 브라우저의 혼합 콘텐츠나 로컬 네트워크 접근 정책으로 차단될 수 있습니다. 브라우저별 동작은 확인되지 않았습니다.

## 확인 필요

- `OLLAMA_ORIGINS`를 지정하면 기본 허용 origin이 그대로 유지되는지는 공식 문서에서 확인하지 못했습니다. 위 "허용 확인"의 `curl`로 필요한 주소를 모두 확인합니다.
- 브라우저별(Chrome, Safari, Firefox) 로컬 접근 허용 동작과 사용자 안내 문구는 실제 브라우저에서 확인해야 합니다. 화면 안내는 #163에서 정합니다.
- 실제 `qwen3:4b` 응답 품질은 #61의 평가와 개발자 PC의 `KOKORO_LIVE_AI=1` 테스트로 확인합니다.
