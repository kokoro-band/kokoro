# Shared Web-Server Contracts

The JSON files in this directory (`furniture-catalog.json`, `local-layout-intent.schema.json`, `fixtures/*.json`) are read directly by the frontend build and backend resources/tests. Both `frontend/` and `backend/` source builds require `docs/contracts/` at the repo root.

## Room coordinate system (`RoomModel` v2)

Shared fixture: `fixtures/room-v2.json`.

- Every point is an `[x, z]` numeric pair in meters (`m`). In top-down floor view, `+x` is right, `+z` is down, and `y` is height above the floor (`y = 0`).
- **Origin difference:** Persisted coordinates use the top-left corner of `bounds` as `(0, 0)`. Only the Three.js 3D scene translates the center of `bounds` to world origin.
- **Furniture coordinates:** Stored as center `x`, `z` (meters) and `rotation` (degrees clockwise from top-down, `0` faces `+z`). Footprint dimensions come from `catalogId`, not the item payload.
- Invalid rooms return `400` with `code: INVALID_ROOM` and `violations`, leaving stored state unchanged.

## Furniture catalog and GLB scaling

- Edit catalog entries only in `furniture-catalog.json`. The frontend bundles it; the backend syncs it on startup into `furniture_catalog` and `furniture_source_assets` (`GET /api/furniture-catalog`).
- `dimensionKind` and `priceKind` are `example`. Keep `modelUrl` as `/models/<name>.glb` (the web loader prepends `VITE_BASE_PATH`). Models are Kenney Furniture Kit 2.0 (CC0).
- **GLB scaling:** On load, align the floor to `Y = 0`, center X/Z at the origin, and scale X and Z independently to match catalog width and depth so rendered bounds match collision bounds. Scale Y by the smaller horizontal scale factor. Show a catalog-sized placeholder mesh while loading or on load failure.

## Manual vs AI placement validation

- **Manual save (`PUT /projects/{id}/layout`):** Permits draft states. Out-of-bounds, wall-intersecting, or overlapping placements still save with `200`, and the frontend displays warnings. Unknown `catalogId`, duplicate `id`, non-finite numbers, and limit violations return `400`.
- **AI placement (`POST /layout/commands`, `POST /layout/intents`):** Validated strictly. Any failure applies nothing and returns `400` with one of `OUTSIDE_ROOM`, `WALL_COLLISION`, `DOOR_CLEARANCE`, `FURNITURE_OVERLAP`, `NO_ANCHOR`, or `NO_VALID_PLACEMENT`. Door clearance is `0.8m` on both sides of the opening.
- **Local AI intent (`local-layout-intent.schema.json`):** Models emit intent only and cannot supply `x`, `z`, or other undeclared fields. The server owns coordinate resolution (including relative placement to doors/windows) and persistence.
- **Fractional rotation:** Manual saves and API responses round-trip 64-bit floating-point degrees without clamping or rounding (`fixtures/furniture-rotation.json`). Rule commands and `/layout/intents` accept integer rotation degrees only.

## Proposal confirmation and optimistic locking (`revision`)

- Destructive commands (such as clear-all) and all `/layout/intents` proposals return `requiresConfirmation: true`, `proposalId`, `expiresAt` (5 minutes), and `proposedCommands` without mutating the project. Apply only via `POST /projects/{id}/layout/commands/confirm` with `proposalId`.
- Re-confirming an already-applied proposal returns the current project idempotently without re-running commands or incrementing `revision`.
- **Optimistic locking:** Project responses include integer `revision` (starts at `0`). Writes with a stale `expectedRevision`, or confirmations whose project `revision` changed since proposal creation, return `409 Conflict`.
- **Server lock order:** Lock the project row first, then floor-plan job or proposal rows (`project -> job/proposal`).
- **Client 409 handling:** Serialize saves and floor-plan status polls through a queue. Never auto-retry `409`; preserve the draft and let the user inspect latest, discard draft for server state, merge-reapply local changes, or defer.

## Uploads, input boundaries, and local storage recovery

Shared fixtures: `fixtures/input-boundaries.json`, `fixtures/furniture-input-boundaries.json`.

- **Server floor-plan upload (`POST /projects/{id}/floor-plan`):** Accepts `.pdf`, `.png`, `.jpg`/`.jpeg` only when extension, MIME, and file magic bytes all match. Limits: `1B..15MiB` file, `16MiB` total multipart request (embedded Tomcat swallows up to `17MiB` on rejection so `413` reaches the client), and `<= 16,000,000` pixels from image headers. Concurrent uploads return `409`; interrupted jobs mark `FAILED` (`PROCESSING_INTERRUPTED`) on server restart. `DELETE /projects/{id}` (`204`) cleans up all uploaded files and queues failed file deletions in `floor_plan_file_cleanup`.
- **Browser image import (client-only):** Still PNG, JPEG, and WebP only (rejects APNG and animated WebP). Enforce `15MiB` and `16,000,000` pixels from headers before decoding, then downscale the long edge to `<= 1200px`.
- **Name length split:** Because browser and Java 17 Unicode versions count graphemes differently, the browser enforces `80` graphemes (and `1024` UTF-16 units) while the server enforces only the `1024` UTF-16 unit ceiling.
- **Local storage (`kokoro-remodel-project-v1`):** Never auto-delete or overwrite corrupted JSON on load. Fall back to a safe example while keeping the raw value intact until the user saves an edit. Out-of-bounds furniture and unknown catalog IDs are not treated as corruption.
