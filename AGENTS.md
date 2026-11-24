# Kokoro Agent Guide

Kokoro is a room remodeling platform where users build floor plans, place furniture, and view the same layout in 2D, 3D, and WebXR VR.

- `frontend/`: React, TypeScript, Vite+, Three.js (2D, 3D, WebXR)
- `backend/`: Java 17, Spring Boot API, PostgreSQL (Flyway)
- `docs/contracts/`: Single source of truth for JSON schemas, furniture catalog, and test fixtures shared by web and server

Treat these instructions as good defaults, not hard rules. The developer's request and intent take precedence. Fight scope creep and skip unnecessary abstractions or ceremony.

## Traps to avoid

- **Shared JSON contracts.** `docs/contracts/*.json` and `fixtures/*.json` are read directly by the frontend build and backend resources/tests. Edit only the JSON source and verify both sides when a contract changes.
- **SEED snippets and recipe CSS.** Do not edit CLI-generated files under `frontend/seed-design/ui/`. When adding a new SEED component, import its recipe CSS in `frontend/src/index.css` or its styles will be missing.
- **Flyway migrations.** Never edit an already-applied `backend/src/main/resources/db/migration/V*.sql` file. Add a new versioned migration instead.
- **Concurrent Playwright E2E runs.** Do not run two E2E suites at the same time in the same checkout; they share `playwright-report/` and `test-results/`.

## Running and verifying

The frontend uses Vite+ (`vp`). Built-in commands run as `vp <name>`, `package.json` scripts run as `vp run <name>`, and dependencies use `vp install`, `vp add`, and `vp remove`. On Nix, `nix develop` provides `vp`, Node, and JDK 17.

Iterate on the changed scope only. CI owns the full regression and E2E suites.

```bash
# Frontend (iterate on changed files)
cd frontend
vp test src/path/to/file.test.ts
vp check

# Backend (requires Docker for Testcontainers)
cd backend
./mvnw -Dtest=SomeTest test
```

- Run full local checks (`vp test && vp run build`, `./mvnw test`) only for broad changes or edits to `docs/contracts/*.json`.
- Verify user-visible UI changes in a real browser when practical.

## Testing

- Test behavior that can break: domain geometry (wall collisions, rotation, bounds), shared contracts, save/conflict recovery, and API validation or authorization.
- Leave out tests for static copy, static markup, what types already guarantee, and purely visual tweaks (spacing, color, alignment).
- Proof for a bug fix depends on the bug. Logic, data, state, and contract bugs get the fewest failing tests first (in an existing test file or table where one fits), then the fix. Purely visual bugs get before/after screenshots and no test.
- Extend an existing test file or table before creating a new file. Never hide flakes with `sleep` waits or retries.

## Documentation

Most code changes need no documentation update. Agents and developers can read the code.

- Keep docs only for cross-boundary contracts, repo traps, and external setup that the source cannot carry well.
- Do not maintain feature, file, or field catalogs, test counts, or dated PR summaries. When documented behavior changes, rewrite or delete the stale text instead of appending.
- Do not commit plans, research notes, or scratch QA logs.

## Pull requests

- Never open a PR unless asked.
- Write PR titles and bodies in Korean, keeping them short (e.g., `feat: 가구 배치 저장 추가`, `fix: 벽 충돌 시 회전각 유지`).
- Link a related issue if one exists. Put only what changed and how you verified it in the body; attach before/after screenshots for UI changes.

## Reference docs

| Area | Read first |
|---|---|
| UI components and SEED v2 rules | [DESIGN.md](DESIGN.md) |
| Env vars, Playwright E2E, local AI, Pages preview | [docs/development.md](docs/development.md) |
| Shared web-server contracts (`RoomModel`, API, catalog) | [docs/contracts/README.md](docs/contracts/README.md) |
| WebXR support matrix and Quest debugging | [docs/webxr.md](docs/webxr.md) |
