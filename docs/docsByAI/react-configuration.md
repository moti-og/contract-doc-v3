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

   Status: Added local placeholder UMD files and server tests to assert they’re served. Tests passing.

2) Preload React in both clients
   - In `web/view.html` add:
     - `<link rel="preload" as="script" href="/vendor/react/react.production.min.js">`
     - `<link rel="preload" as="script" href="/vendor/react/react-dom.production.min.js">`
     - `<script defer src="/vendor/react/react.production.min.js"></script>`
     - `<script defer src="/vendor/react/react-dom.production.min.js"></script>`
     - Then `<script defer src="/ui/components.react.js"></script>`
   - In `addin/src/taskpane/taskpane.html` do the same (the dev server proxies `/vendor` and `/ui` to 4001).

   Status: Added preload/defer script tags to `web/view.html` and `addin/src/taskpane/taskpane.html`, plus inclusion of `/ui/components.react.js`. React mounts are guarded and can coexist with legacy DOM.

3) Create `/shared-ui/components.react.js`
   - Export a `mountReactApp({ rootSelector })` that:
     - Creates a React root inside the existing container (e.g., `#app-root` or a new `#react-root`).
     - Wraps children with `ThemeProvider` (fetches `/api/v1/theme`) and `StateProvider` (fetches `/api/v1/state-matrix`, listens to `/api/v1/events`).
     - Initially render only `BannerStack` to minimize risk.

   Status: Added `shared-ui/components.react.js` with `mountReactApp`, `ThemeProvider`, `StateProvider`, and a `BannerStack` component. Added server test asserting `/ui/components.react.js` is served. Tests passing.

4) Migrate Send-to-Vendor modal to React
   - Keep the same server schema (`/api/v1/ui/modal/send-vendor`).
   - Build a `SendVendorModal` component that consumes schema fields/actions and modal tokens from ThemeProvider.
   - Wire the “Send” action to `POST /api/v1/send-vendor`.

   Status: Implemented a React `SendVendorModal` and a global `openReactModal(id, options)` trigger. Updated legacy button to prefer the React modal when available, falling back to server-rendered modal. Added server test for modal schema. Tests passing.

5) Migrate ActionButtons and button tokens
   - Add optional `buttons` tokens to `data/app/theme.json` (e.g., `buttons.primary.bg/fg`, `buttons.secondary.bg/fg`).
   - Implement `ActionButtons({ buttons, actions })` that renders allowed actions from `config.buttons` and uses `ThemeProvider` tokens.

6) Migrate Exhibits/Approvals
   - `ExhibitsList` fetches `/api/v1/exhibits` and renders links/upload flow.
   - `ApprovalsPanel` (stub) reads `/api/v1/approvals/state` when available.
   - Remove the equivalent non-React code once parity is confirmed.

7) Testing and rollout
   - Jest for pure component logic (props → rendered output); no DOM side effects.
   - Playwright smoke remains unchanged; ensure selectors (e.g., `.ms-Button` and visible button text) persist.
   - Add a lightweight feature flag (e.g., a global `window.__USE_REACT__` or server-driven toggle) to enable/disable React rendering in case we need quick rollback.

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


