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


