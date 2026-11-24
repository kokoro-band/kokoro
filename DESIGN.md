# Kokoro SEED Design Rules

The web UI uses [SEED Design v2](https://seed-design.io/components). Keep the Three.js canvas as a rendering surface and apply SEED to DOM overlays and panels.

## Core rules

- **SEED first.** Prefer `@seed-design/react` components and CLI snippets under `frontend/seed-design/ui/`. Never edit generated snippet files directly.
- **Semantic tokens only.** Use SEED semantic tokens (`fg.neutral`, `bg.layerDefault`, etc.) instead of raw hex values or Tailwind color palettes.
- **One orange primary per view.** Do not put two competing orange (`#ff6f0f`) actions on the same screen. Use `critical`, `informative`, and `positive` tokens for status.
- **Flat by default.** Separate regions with surface tone, spacing, and dividers. Avoid gradients, glass effects, glowing borders, heavy shadows, nested cards, and decorative emoji icons.

## Typography and copy

Do not set `font-size` or `font-weight` in CSS. Pass a semantic role to `Type` in `frontend/src/components/kokoro/Type.tsx`.

| Role | SEED textStyle | Use |
|---|---|---|
| `display` | `screenTitle` | Primary view title (one per screen) |
| `title` | `t6Bold` | Panel title, selected item name, price total |
| `heading` | `t5Bold` | Panel section heading |
| `body` | `t5Regular` | Body text, AI conversation |
| `description` | `t4Regular` | Short helper text (`fg.neutralMuted`) |
| `label` | `t4Medium` | Item and field labels |
| `caption` | `t3Regular` | Counts, units, save status (`fg.neutralMuted`) |

- Enable tabular numerals with `numeric` for prices and dimensions, and keep `word-break: keep-all` for Korean text.
- Write UI copy in polite Korean active voice (해요체, e.g., `구조를 저장했어요`) and attach object particles with `withObjectParticle`.
- Use Line icons from `@karrotmarket/react-monochrome-icon` for UI actions and `FurnitureThumb` for furniture thumbnails.

## Layout and shortcuts

- Use `ToolbarChoice` (ghost Action Button) in the 48px toolbar and top navigation instead of pill-shaped `Segmented Control`. Below `820px`, the layout switches to the mobile bottom dock and `Bottom Sheet`.
- Register shortcuts centrally in `frontend/src/features/studio/shortcuts.ts` and bind them with `useShortcut`. Match by `event.code` so shortcuts work with Korean IME active, and ignore events when an input, dialog, or menu is open.

## SEED v2 gotchas

- **Recipe CSS.** `frontend/src/index.css` imports only the SEED recipe CSS files in use. Adding a new SEED component requires adding its recipe import to `index.css`.
- **Snackbar.** Never render declaratively; use `SnackbarProvider` and `useSnackbarAdapter().create()`. Do not mount `SnackbarAvoidOverlap` inside hidden views or its measured offset breaks.
- **Loading Indicator.** Works only inside a pending button. Use `Progress Circle` outside buttons.
- **Result Section.** Its default button variant is `neutralWeak`, so place it on `bg.layerDefault`.
- **Content Dialog.** SEED sets `word-break: break-all`; keep the app override back to `keep-all`.
- **Slider.** `onValuesCommit` fires only on pointer release; commit keyboard adjustments in `onKeyUp`.
- **Wrapper boundary.** Keep wrappers in `frontend/src/components/kokoro/` thin (layout and labels only, no API calls, owned state, or 3D logic).
