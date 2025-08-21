# Infrastructure and Stack Plan

## Goals
- Maximize the server: move logic, permissions, and state computation to the backend.
- Identical client data pipelines: both Word addin and Web consume the same endpoints and JSON contracts.
- Identical rendering: shared client modules produce the same UI; diverge only where platform constraints force it.
- Reuse aggressively: one modal system, one banner system, one statematrix client.
- SuperDoc provides the documentediting backbone (frontend + collaboration backend); our server orchestrates product workflows.

Reference: https://docs.superdoc.dev/

## Components
- **Server** (`server/`)
  - Responsibilities: state matrix generation, approvals, finalize/unfinalize, notifications, file orchestration, SSE events, integration with SuperDoc backend.
  - HTTPS dev server at `https://localhost:3001`; hosts both web and add‑in from the same origin.
  - Exposes uniform REST (+SSE) consumed by both clients.
- **Clients** (`clients/`)
  - Addin (`clients/addin/`): Word taskpane UI, Office.js bridge; relies on shared client modules.
  - Web (`clients/web/`): Browser UI; relies on shared client modules.
  - Shared (`clients/shared/`): Statematrix client, modal/banner/menus, SSE handler, formatting utils.
- **SuperDoc services**
  - SuperDoc frontend SDK embedded in our clients for rich editing.
  - SuperDoc collaboration backend (Docker) at `https://localhost:4100` for OT/CRDT, comments, track changes, import/export.
- **Data** (`data/`)
  - App (`data/app/`): canonical users, sample documents, config/fixtures (safe to commit if not sensitive).
  - Working (`data/working/`): developer uploads, temp, logs (ignored by VCS).

## Data Flow
1. Client actions (edit, approve, finalize)  SuperDoc editor emits document deltas/events.
2. SuperDoc backend persists/collaborates, emits change notifications.
3. Our server ingests relevant events, applies business rules and state transitions, emits SSE updates.
4. Clients subscribe to SSE; shared client applies new state matrix  UI parity across platforms.

## Prototype Mode (simplifications)
- No authentication and no database.
- Use in-memory state with optional JSON file persistence under `data/app` (seed) and `data/working` (temp).
- Ship with four canonical demo users and a simple user switcher (no Okta).
- Single-process server; SSE for realtime; no email automation, vendor portal, or MSI packaging.
- Minimal error handling/logging suitable for demos; add robustness later.

## API Contracts (uniform for both clients)
- GET `/api/current-document`  metadata
- GET `/api/state-matrix?userRole&platform&userId&isCheckedOut&checkedOutBy`  JSON config to drive UI
- GET `/api/approvals/state?documentId`
- GET `/api/approval-matrix?actorPlatform&actorId&documentId`
- POST `/api/approvals/*` (approve|reject|add-user|reorder|update-notes)
- POST `/api/finalize`, `/api/unfinalize`
- SSE `/api/events`

## Rendering & Reuse
- Single React-based UI layer loaded via CDN and served from one module:
  - React/ReactDOM included via CDN in both clients.
  - One ES module under `server/public/ui/` exports shared components (Modal, Banner, Dropdown, Finalize, Approvals) and mount helpers.
  - Both clients import the same module; state/props come from the server state matrix.
  - No bundlers; HTML-first for fast Office WebView startup.

## Auth
- No authentication. Clients include a local user switcher; server trusts user selection for demos.

## Build & Dev
- Node 18+.
- Dev ports: server/add‑in/web `https://localhost:3001`; SuperDoc backend `https://localhost:4100`.
- PowerShell scripts to start/stop all services; health endpoint and smoke tests.
- Monorepo; keep clients HTMLfirst for fast Office WebView startup; shared code in plain TypeScript/JS.

## Testing
- Unit tests: server business rules; shared client state application.
- Integration tests: API + SSE; crossclient parity checks (same state  same visible UI).
- Snapshot tests for menu/modal configs derived from the state matrix.

## Environments & Config
- `.env` for server (ports, SuperDoc endpoints, storage roots). Okta variables reserved for later phases.
- Config profiles (dev/stage/prod) under `server/config/`.
- Self-hosted SuperDoc backend URL(s) configured per environment.

## Storage and Files
- Document storage handled by SuperDoc backend.
- Our server stores lightweight metadata and workflow state; large binaries flow through SuperDoc.
- File management orchestrator exposes "View Latest", finalize/draft toggles, and safe replace.

## Branching Strategy (featurealigned)
- `main`: stable.
- Feature branches named after Project Summary features, e.g.: `feat/okta-auth`, `feat/approvals`, `feat/finalize`, `feat/templates`, `feat/variables`, `feat/signatures`, `feat/vendor-experience`, `feat/lock-sections`, `feat/ai-basics`, `feat/file-management`.
- Parity rule: a feature is complete when both clients function with the same server contracts.

## What we need from SuperDoc
- Licensing & versioning
  - Target version and license (AGPLv3 or commercial) and any constraints.
- Backend deployment details
  - Supported deployment model (Docker/K8s), persistence requirements, backup/restore strategy.
  - Realtime collaboration protocol (OT/CRDT) endpoints we integrate with.
  - Auth integration options (JWT/OIDC) to align with Okta.
- Import/Export & compatibility
  - DOCX/PDF import/export APIs; tracked changes and comments fidelity guarantees.
  - Limits (document size, media, headers/footers, sections, styles) and performance SLAs.
- Events & hooks
  - Webhooks or servertoserver events for document updates; client SDK events we should subscribe to.
  - Extension points for custom nodes/toolbar and how to package them.
- SDK specifics
  - Frontend SDK package names, init options, collaboration room semantics, presence, comments.
  - Accessibility guarantees and keyboard navigation constraints.

Reference: https://docs.superdoc.dev/

## What we need from your company style guide
- Design tokens (colors, spacing, radii, shadows), typography scale, iconography.
- Component standards (modal, button, inputs, dropdowns), motion guidelines, focus states.
- Accessibility requirements (contrast, keyboard traps, screen reader expectations).
- Content and copy guidelines (labels, capitalization, tone for banners/modals).
- Code standards: ESLint/Prettier configs, TypeScript settings, commit conventions, CI policies.
- Branding assets (logos, favicons) and usage rules.

## Next Steps
1. Confirm SuperDoc backend deployment approach.
2. Lock API contracts for state matrix and approvals.
3. Scaffold shared modal/banner and state-matrix client in `clients/shared/`.
4. Wire both clients to the same endpoints; add SSE parity.
5. Create canonical users in `data/app/users` and a simple user switcher.
