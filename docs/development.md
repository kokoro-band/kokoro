# Development Runbook

## Toolchain

On Nix, `nix develop` (or `direnv allow`) from the repo root provides `vp`, Node, JDK 17, `ollama`, `git-lfs`, and `OLLAMA_ORIGINS`.

## Environment variables

### Frontend (`frontend/`)

- Defaults to local demo mode (browser storage, no backend). Set `VITE_API_MODE=server` to connect to Spring.
- In `vp dev`, omitting `VITE_API_BASE_URL` defaults to `http://localhost:8080/api`. Plain HTTP is allowed only for loopback (`localhost`, `127.0.0.1`, `[::1]`).
- Production builds with `VITE_API_MODE=server` require `VITE_API_BASE_URL` to be an HTTPS URL or a root-relative path such as `/api`.

### Backend (`backend/`)

- Database: `DB_URL`, `DB_USERNAME`, `DB_PASSWORD` (run local PostgreSQL with `docker compose up -d`).
- Floor plan storage: `FLOOR_PLAN_STORAGE_ROOT` (defaults to the system temp directory).
- Auth profiles: `local` (default) runs as `local-user` with no token. `prod` validates Cognito JWTs via `COGNITO_ISSUER_URI`.
- `./mvnw test` runs PostgreSQL via Testcontainers, so Docker must be running.

## Playwright E2E

Install Chromium once:

```bash
cd frontend
vp install
vp exec playwright install chromium   # add --with-deps on Linux CI
```

| Command | Scope | Requirements |
|---|---|---|
| `vp run test:e2e` | Real Spring + disposable PostgreSQL + server-mode web | Java 17, Docker, Vite+ |
| `vp run test:e2e:local-ai` | Local-demo browser WebGPU AI flow (mocked Worker responses) | Vite+ |
| `vp run test:e2e:ollama` | Server-mode Ollama intent/confirmation flow (mocked Ollama HTTP) | Java 17, Docker, Vite+ |
| `vp run test:e2e:ollama:live --project=desktop` | Live `qwen3:4b` end-to-end round-trip (not run in CI) | Java 17, Docker, Vite+, local Ollama |

Filter by viewport or suite:

```bash
vp run test:e2e --project=desktop
vp run test:e2e --project=narrow --suite=uploads
```

Each runner allocates free ports, a disposable container, and temp storage, and tears them down on exit. Run one E2E suite at a time per checkout to avoid overwriting `playwright-report/` and `test-results/`.

## Local AI (Ollama and WebGPU)

- **Local demo (WebGPU):** Choosing `이 기기에서 AI 실행` downloads `Qwen3 0.6B ONNX` (~570MB) and runs inference in the browser via WebGPU.
- **Server mode (Ollama):** Choosing `이 PC의 Ollama 사용` calls `qwen3:4b` at `http://127.0.0.1:11434` from the browser; Spring validates and computes coordinates.

Configure Ollama and exact CORS origins (never use `*`):

```bash
ollama pull qwen3:4b
# macOS Ollama app (restart the app after setting)
launchctl setenv OLLAMA_ORIGINS "http://localhost:5173,https://kokoro-band.github.io"
# Or run from a terminal
OLLAMA_ORIGINS="http://localhost:5173,https://kokoro-band.github.io" ollama serve
```

Verify CORS preflight:

```bash
curl -i -X OPTIONS http://127.0.0.1:11434/api/chat \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: POST"
```

## GitHub Pages local preview

`.github/workflows/pages.yml` builds with `VITE_API_MODE=local` and `VITE_BASE_PATH=/kokoro/`. Preview the same build locally:

```bash
cd frontend
VITE_API_MODE=local VITE_BASE_PATH=/kokoro/ vp run build
VITE_BASE_PATH=/kokoro/ vp preview
```

Open `http://localhost:4173/kokoro/` (midterm slides: `/kokoro/presentations/midterm/`).
