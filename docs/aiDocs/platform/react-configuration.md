### React configuration

This document explains how to introduce React into the existing prototype while keeping our server-driven model (state-matrix, theme tokens, SSE). We’ll host React locally (no CDN), preload it in both clients, and migrate UI islands incrementally.

### Goals
- Use React for rendering, composition, and predictable updates.
- Keep server as source of truth for data/config: `/api/v1/state-matrix`, `/api/v1/theme`, `/api/v1/events`.
- Maintain one shared UI module for both web and Word add-in.
- Avoid build-step risk: use locally hosted UMD builds and simple scripts.

### Architecture overview
- Server
  - State: `/api/v1/state-matrix` drives which actions are allowed and which banners to show.
  - Theme: `/api/v1/theme` returns generic style tokens (no labels/logic), e.g. `banner.[state]` and `modal.*`.
  - SSE: `/api/v1/events` pushes events + a monotonically increasing `revision` for client resync.

- Client (React + minimal adapters)
  - Local vendor React UMD bundles under `/vendor/react/` (served by backend at 4001, proxied to add-in dev server at 4000).
  - Preload `react` and `react-dom`, then load a new `/ui/components.react.js` entry.
  - A tiny StateProvider fetches matrix, subscribes to SSE, and exposes `{ config, revision, actions }` via React context.
  - A ThemeProvider fetches theme tokens once and exposes token accessors via context.
  - React components (BannerStack, ActionButtons, SendVendorModal, ExhibitsList, ConnectionBadge) read from the providers and render.
  - Existing non-React DOM can coexist; we’ll replace pieces progressively.

### Implementation plan (incremental)
1) Vendor React locally (no CDN)
   - Add files:
     - `server/public/vendor/react/react.production.min.js`
     - `server/public/vendor/react/react-dom.production.min.js`
   - Verify they’re served at:
     - `https://localhost:4001/vendor/react/react.production.min.js`
     - `https://localhost:4001/vendor/react/react-dom.production.min.js`

   Status: Completed. Real React/ReactDOM UMDs are now vendored via `npm run vendor:react`; tests in place to assert serving.

2) Preload React in both clients
   - In `web/view.html` add:
     - `<link rel="preload" as="script" href="/vendor/react/react.production.min.js">`
     - `<link rel="preload" as="script" href="/vendor/react/react-dom.production.min.js">`
     - `<script defer src="/vendor/react/react.production.min.js"></script>`
     - `<script defer src="/vendor/react/react-dom.production.min.js"></script>`
     - Then `<script defer src="/ui/components.react.js"></script>`
   - In `addin/src/taskpane/taskpane.html` do the same (the dev server proxies `/vendor` and `/ui` to 4001).

   Status: Completed. Preload/defer in both clients; mounts guarded. Added guard to skip mounting when placeholder UMDs are detected.

3) Create `/shared-ui/components.react.js`
   - Export a `mountReactApp({ rootSelector })` that:
     - Creates a React root inside the existing container (e.g., `#app-root` or a new `#react-root`).
     - Wraps children with `ThemeProvider` (fetches `/api/v1/theme`) and `StateProvider` (fetches `/api/v1/state-matrix`, listens to `/api/v1/events`).
     - Initially render only `BannerStack` to minimize risk.

   Status: Completed. `mountReactApp`, `ThemeProvider`, `StateProvider`, `BannerStack` present; server test asserts serving.

4) Migrate Send-to-Vendor modal to React
   - Keep the same server schema (`/api/v1/ui/modal/send-vendor`).
   - Build a `SendVendorModal` component that consumes schema fields/actions and modal tokens from ThemeProvider.
   - Wire the “Send” action to `POST /api/v1/send-vendor`.

   Status: Completed. React `SendVendorModal` + `openReactModal()` present; legacy button prefers React.

5) Migrate ActionButtons and button tokens (new plan: React is authoritative renderer)
   - Implement `ActionButtons({ buttons, actions })` that renders allowed actions from `config.buttons` and uses Theme tokens.
   - Actions include: Checkout, Checkin, Cancel Checkout, Save Progress, Finalize/Unfinalize, Override Checkout, Send to Vendor, Factory Reset.
   - Use existing endpoints; share Save Progress logic (Word export; web fetch current bytes) within React actions.
   - Optional: add `theme.buttons.*` tokens for styling.

6) Migrate Exhibits/Approvals
   - `ExhibitsList` fetches `/api/v1/exhibits` and renders links/upload flow.
   - `ApprovalsPanel` (stub) reads `/api/v1/approvals/state` when available.
   - Remove the equivalent non-React code once parity is confirmed.

7) Testing and rollout
   - Add-in first, then web (to avoid double renderers). Mount React into a dedicated `#react-root` container; keep legacy UI for one test cycle.
   - Jest for component logic (props → actions); API tests remain green.
   - Playwright: extend smoke to click React-rendered buttons; selectors unchanged where possible.
   - Use a lightweight feature flag (`window.__USE_REACT__`) to enable React rendering per client; remove after cutover.

### Milestones aligned with verification flow
1) Build shared React components (ActionButtons, ExhibitsList, ConnectionBadge, UserCard, DocumentControls) and wire actions.
   - Status: Completed. Components added; Save Progress shares logic across Word/web.
2) Test shared components
   - Status: Completed. Backend tests green; manual validation in add-in/web ongoing.
3) Implement React in the add‑in (behind flag)
   - Status: Completed. React is now the authoritative right‑pane UI mounted at `#app-root`; legacy mount removed.
4) Test the add‑in
   - Status: Completed (initial). Manual flows validated: checkout, Save Progress (Word export), checkin/finalize, Send to Vendor; no placeholder warnings.
5) Implement React in the web (behind flag)
   - Status: Completed. React is authoritative via `#react-root`; legacy mount removed in `view.html`.
6) Test in the web
   - Status: Completed (initial). Manual validation shows banners, ActionButtons (incl. Save Progress), DocumentControls, Exhibits, and connection badge.
7) End‑to‑end testing and cutover
   - Status: Planned. Remove legacy UI, remove flag, docs updated.

### Theme tokens (stays server-driven)
- Keep `data/app/theme.json` as the single source of style tokens.
- Banners: `theme.banner[state].pillBg/pillFg` used by `BannerStack`.
- Modals: `theme.modal.background/headerBg/headerFg/border/primary/muted` used by `SendVendorModal`.
- Buttons (optional): add `theme.buttons.primary/secondary` for global consistency outside modals.

### Performance
- Preload + defer for React UMD scripts avoids blocking and ensures fast first render.
- Local hosting removes CDN variability and TLS issues.
- No hydration or SSR is required; we’re purely client-rendered.

### Word add-in specifics
- Office.js remains as-is; React only manages our right-pane UI.
- API_BASE detection continues to route the add-in through `https://localhost:4001` for shared UI and assets.

### Risks and mitigations
- Duplicate UI during migration: mount React in a dedicated container; remove legacy DOM for each migrated feature immediately after parity.
- Script ordering: preload React, then load `/ui/components.react.js` with `defer`.
- Theming drift: components must only read tokens from ThemeProvider (backed by `/api/v1/theme`).

### Acceptance criteria
- BannerStack renders from `config.banners` and applies theme tokens from `/api/v1/theme` (React path).
- Send-to-Vendor modal renders via React using server schema and modal tokens.
- Action buttons respect server permissions and (optionally) theme button tokens.
- Playwright smoke passes unchanged; backend Jest tests stay green.


### New milestone: React owns SuperDoc (hosted editor)

Goal: React becomes the single owner of the document source shown in the editor on the web, eliminating the remaining imperative bootstrap/event glue.

Why: Ensures the state matrix + revision fully drive which document (working vs canonical) is rendered; avoids caching drift and out-of-band updates.

Scope (no server behavior change):
- Create a thin React host component to mount/destroy/update the SuperDoc editor.
- Move “open” decisions (working/canonical, cache-bust) into React based on `revision` and state.
- Remove legacy imperative open-url event handlers once React path is verified.

Implementation tasks (to do)
1. Add SuperDocHost (React)
   - Location: `shared-ui/` (co-located with `components.react.js`), exported and used only on web.
   - Props: `documentSource` (string URL or File/Blob), `documentMode` ('editing'|'suggesting'|'viewing').
   - Behavior: mounts via `window.SuperDocBridge.mount(documentSource)` on first render; on prop change, calls `window.SuperDocBridge.open(documentSource)`; cleans up with `destroy()` on unmount.
2. Drive documentSource from React state
   - In `StateProvider`, expose `revision` (already available) and a setter for `documentSource`.
   - In `App`, compute preferred URL: HEAD `/documents/working/default.docx` else `/documents/canonical/default.docx`, append `?rev=${revision}`.
   - On SSE saveProgress/revision change, update `documentSource` when appropriate.
3. Update DocumentControls
   - “View Latest” sets `documentSource` (working preferred + `rev`), rather than dispatching DOM events.
   - Keep Word path unchanged (Office.js insert).
4. Cut over the web bootstrap (no fallbacks)
   - Immediately remove `window`-level `superdoc:open-url` listeners and imperative open/DOM-replacement code in `web/view.html`.
   - Keep only the SuperDoc UMD load and containers; all orchestration occurs via React.
5. Safe removal (hard cutover)
   - Delete legacy event handlers and glue in the same change.
   - Search and remove any references to `superdoc:open-url` and DOM-driven editor mounts.

Tests to add
- API/Jest (server)
  - Assert `Cache-Control: no-store` on document endpoints (`/documents/working/default.docx`, `/documents/canonical/default.docx`).
  - Existing save-progress tests remain unchanged (guard against regressions).
- React/unit (optional light tests)
  - SuperDocHost mounts once and calls `open` on prop change (mock `SuperDocBridge`).
- E2E/Playwright (web)
  - Flow: Checkout → make an edit → Save Progress → View Latest.
  - Assert: a GET for `/documents/working/default.docx?rev=...` occurs; after View Latest, editor content reflects the saved change or the file size increases (if content assertion is not feasible).
  - Assert no further GET for the same `rev` when re-rendering without changes (host reuses instance correctly).

User acceptance (sign-off checklist)
- Add-in: Save Progress → View Latest inserts the saved content.
- Web: After Save Progress, View Latest loads the working overlay (observed visually and via Network rev param). No unexpected reversion to canonical.
- Switching roles/modes or receiving SSE revision updates refreshes the web editor only when `revision` changes.

Rollout plan (hard cutover)
1. Implement React SuperDocHost and wire `documentSource` from state.
2. Remove all legacy event wiring and imperative bootstrap in the same PR.
3. Verify locally (manual + Playwright). If issues, fix React path rather than reintroducing fallbacks.
4. Update docs (this file) and reference the removal of the old open-url handler.

Risks and mitigations (with concrete actions)
- SuperDoc API expectations
  - Action: Fetch DOCX with `cache: 'no-store'`; pass a File/Blob to the host first; only pass URLs if File/Blob path fails.
  - Action: Add a quick runtime assert that the first two bytes are PK (optional dev-only warning).
- Double-mount/ghost instances
  - Action: In SuperDocHost, call `destroy()` on any existing instance before mounting; null out `window.superdocInstance` after destroy.
  - Action: Recreate toolbar/container nodes on re-open to ensure a clean DOM surface.
- Cache drift
  - Action: Append `?rev=${revision}` to working/canonical URLs; ensure server sets `Cache-Control: no-store` on document endpoints (already implemented).
- SSE/resync storms
  - Action: Only refresh `documentSource` on actual `revision` changes; debounce if needed (not expected in prototype).

### Error handling and diagnostics (no fallbacks, clear errors)

Principles
- Fail fast with a visible, informative UI message; also write a concise entry to the Notifications panel and `console.error` with structured details.
- No silent retries or hidden fallbacks. If something fails, surface the exact reason (status, URL, rev) so it’s easy to troubleshoot.

What to show on failure (web editor)
- Document fetch error (initial or View Latest):
  - UI: Inline error panel above the editor: “Failed to load document” with fields: `url`, `status`, `rev`, `cache: no-store` used.
  - Notifications: “doc load ERR status=… url=… rev=…”.
  - Console: `console.error('doc_load_error', { url, status, rev, headers })`.
- SuperDoc mount/update error:
  - UI: “Editor initialization failed. See console for details.”
  - Notifications: “superdoc ERR …”.
  - Console: `console.error('superdoc_init_error', error)`.

What to show on failure (Word add‑in)
- Office export error:
  - UI/Notifications: “word export ERR … (getFile/getSlice)” plus `sliceCount`, first slice meta.
  - Console: structured logs for slice meta and total size.
- Save Progress 4xx/5xx:
  - UI/Notifications: “save-progress ERR <status> <server.error>”.
  - Console: include payload size and first bytes check (PK header boolean).

Tasks
- Add a small error banner component in React to render inline editor errors with details.
- Extend Notifications logging to include `doc load ERR` and `superdoc ERR` events with structured context.
- Ensure all document fetches include `cache: 'no-store'` and log that value too.

Tests
- Playwright (web): stub a 500 on `/documents/working/default.docx` and assert the inline error banner appears with status and URL; assert a Notifications entry was added.
- Manual (add‑in): trigger a save-progress 409 (not checked out) and verify the Notifications show “Not checked out”; confirm no fallback occurred.

Acceptance
- When document load fails on the web, the user sees exactly which URL and status failed, plus a Notifications entry; no hidden retries.
- When save fails in Word, the user sees a clear reason (status/message) and size/PK checks in console; no fallback path is triggered.


### Canonical React UI and Base Components (prerequisite)

We will build this once, correctly: React is the canonical renderer for all UI objects. No temporary wrappers, no dual paths.

- Canonical policy
  - React owns all interactive UI (buttons, modals, pills/badges, cards, lists) in both Web and Word taskpane.
  - All new UI must be implemented as React components; legacy DOM utilities should be removed as React reaches parity.
  - Theming flows exclusively through `/api/v1/theme` → CSS variables → component classes; no inline hex/rgba in JS.

- Shared base components (initial set)
  - Button (authoritative action control)
  - Modal (header/body/footer shell)
  - Pill/Badge (status chips)
  - Card/Panel (framing surface)
  - Layout helpers (Stack/Inline/Box optional)

- Button component contract (single API)
  - Signature
    - `<Button variant="primary|secondary|ghost|danger" size="sm|md|lg" pulse={boolean} disabled loading iconLeft iconRight onClick className ariaLabel>
        {children}
      </Button>`
  - Behavior
    - Variant maps to semantic CSS variables (no inline colors).
    - Size adjusts padding/height/typography via variables.
    - `pulse` toggles a brand-compliant pulsing animation; honors `prefers-reduced-motion: reduce` and is suppressed when `disabled` or `loading`.
    - `loading` shows a spinner; pulse is disabled while loading.
    - Focus ring is always visible on keyboard focus (WCAG); high-contrast inherits from variables.
  - Theming (variables)
    - Reads: `--button-<variant>-bg/fg/border`, `--radii-sm..`, `--spacing-*`, `--shadow-*`.
    - Pulse reads: `--button-pulse-color` (defaults to currentColor), `--pulse-scale` (default 0.02), `--pulse-duration` (600ms).
  - Constraints
    - Do not accept color props; all color is from tokens.
    - Allow `className` for layout hooks only; style overrides are discouraged except for margins.

- CSS variables baseline (hydrated once at runtime)
  - Surfaces: `--surface-base`, `--surface-muted`
  - Borders/text: `--color-border`, `--color-text-strong`, `--color-text-muted`
  - Buttons: `--button-primary-*`, `--button-secondary-*`, `--button-ghost-*`, `--button-danger-*`
  - Pulse: `--button-pulse-color`, `--pulse-scale`, `--pulse-duration`
  - Overlay/elevation: `--overlay-scrim`, `--shadow-modal`
  - Radii/spacing scales: `--radii-*`, `--spacing-*`

- Migration requirements (no temporary dual APIs)
  - Replace all raw `<button>` usages in React surfaces with `<Button>`.
  - Remove any separate `PulsingButton` components; pulsing is a `pulse` prop on `Button`.
  - Convert ad-hoc inline styles to classes backed by variables (see Branding CSS Spec Phase 1).

- Acceptance for this baseline
  - All action controls in React UI render through `<Button>` with `variant`/`size` props.
  - The pulsing behavior is opt-in via `pulse` and respects reduced-motion.
  - No inline hex/rgba remain in React files; visual parity is preserved.
  - Theme updates (e.g., changing `theme.json` button tokens) reflect without JS changes.

- Notes
  - Word taskpane uses the same `<Button>` and variables; ensure Office-specific constraints do not reintroduce inline colors.
  - If a variant is missing in tokens, the component applies safe defaults and logs a development warning.
