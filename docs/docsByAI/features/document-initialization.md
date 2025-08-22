# Feature: Document Initialization & Cross‑Platform Sync

## Summary
- Purpose: fix slow/empty loads on Web and keep Web ↔ Word in sync when a document is opened.
- Scope: client-first hardening with light server event echo; no schema changes.
- Outcomes:
  - Web reliably starts with a non-empty document or shows an actionable retry.
  - Opening a document on one platform initializes/refreshes the other to the same document.
- Non‑goals (do not rebuild):
  - We will use the existing initialization flows. Do not rewrite them; harden and instrument them. Only replace/delete if a new approach is measurably simpler and more reliable and passes acceptance criteria.
  - Reuse existing hooks and endpoints (`superdoc:open-url`, `/documents/default.docx`, SSE). The work here is to diagnose and fix flakiness, add retries/backoff, and improve UX/telemetry—not to create a new loader.
  - Deletion rule: keep → fix → (optionally) run a side‑by‑side behind a flag → remove legacy only after bake‑in, benchmarks (TTFD, error rate), and a rollback path exist.

## Part 1 — Web initialization reliability

### Symptoms to address
- First load sometimes shows a blank editor or stalls for several seconds.
- No clear retry path or skeleton UI during initial fetch/mount.

### Likely causes (based on current implementation)
- Single HEAD probe to `/documents/default.docx` can pass while subsequent GET/render fails.
- DOM remount of `#superdoc-toolbar` and `#superdoc` before mount completes can briefly blank the UI.
- No timeout/backoff; transient network or file IO issues lead to silent failure.

### How to test current issues and what to do about them
- Manual repro (Web):
  - Disable cache and hard‑reload. In Network tab, watch `/documents/default.docx` (HEAD, then GET) and record TTFD (time to first document displayed).
  - Repeat with throttled bandwidth (e.g., 1–2 Mbps). Note if the editor is blank or stalls.
  - Compare resolver vs canonical vs working URLs:
    - Resolver: `/documents/default.docx`
    - Canonical: `/documents/canonical/default.docx`
    - Working: `/documents/working/default.docx` (when present)
  - Check `/debug` (or server logs) for active path and IO errors.
- Quick triage/actions:
  - HEAD 200 but GET stalls → treat HEAD as advisory; add GET timeout + retry/backoff; fall back to canonical.
  - GET fast but blank render >2s → show skeleton immediately; ensure DOM replacement completes before mount; log `init.error` with sequencing note.
  - Resolver 404 but canonical present → fall back to canonical; log `init.warning` for missing working overlay.
  - SSE disconnects on load → do not block init on SSE; connect in parallel; badge shows when connected.
- Test cases (pass/fail):
  - Cold start (no cache) → document visible within ~10s or inline retry UI.
  - Resolver missing → canonical opens automatically; warning recorded.
  - Artificial latency (≥1s/req) → skeleton shown, no prolonged blank canvas; mount succeeds or retry is offered.
  - Forced GET failure → retries trigger and fallback path works; “Retry” button functions.
- What to collect:
  - TTFD metric, chosen URL (resolver/canonical), retry count, final outcome (`success|fallback|error`).
  - Any mount errors or unhandled promise rejections in console.

### Proposed changes
- Fetch flow
  - Prefer resolver URL `/documents/default.docx` for initial open; if it fails, fall back to canonical `/documents/canonical/default.docx`.
  - Add GET timeout (6–8s) with exponential backoff (up to 3 attempts) and inline retry button.
- Mount sequencing
  - Show a lightweight skeleton while fetching.
  - Replace toolbar/container nodes, then mount the editor; avoid double-remount within the same tick.
- UX & telemetry
  - Inline error state with “Retry” and “Open debug” links on failure.
  - Emit client events: `init.start`, `init.success`, `init.error` with duration and chosen URL.

### Acceptance
- Web renders either the document or a visible retry within ~10s.
- Three retries with backoff before showing final error.

## Part 2 — Cross‑platform initialization and sync

### Desired behavior
- A) On initialization, auto-trigger “View Latest” to open the default doc on both platforms.
- B) When a document is opened on one platform, the other opens the same document automatically.

### Building blocks (existing)
- Programmatic open hooks (Web): `superdoc:open-url`, `superdoc:open-file`, `superdoc:set-mode`.
- Server events (SSE): `GET /api/v1/events` (subscribe), `POST /api/v1/events/client` (echo → broadcast).
- Resolver path: `GET /documents/default.docx` (prefers working when present).

### Design
- Initialization
  - Web: after UI is ready, dispatch `superdoc:open-url` with `/documents/default.docx` (consistent with View Latest).
  - Word: on taskpane ready, call the shared “View Latest” routine to replace the current document with the canonical/working default.
- Cross-platform document open
  - Emit on open: POST to `/api/v1/events/client` with `{ type: 'documentOpened', url, origin: 'web'|'word', ts }`.
  - Receive: both platforms listen to SSE; when `documentOpened` arrives from the other origin and `url` differs from the current document, open that URL.
  - Loop guard: maintain `lastOpenedUrl` and `lastOpenedTs`; ignore self-origin or duplicate events within ~2–3s.
  - Local file (Web only): if a user opens a local file, first persist it server-side as the current working document, then broadcast the server URL so Word can fetch it.
- Safety rules
  - If the receiver holds checkout or is finalizing, show a banner: “Remote document change detected — View Now / Dismiss.” Auto-view when idle.

### Acceptance
- Auto “View Latest” runs on startup in both platforms (no manual click).
- Opening a document in Web refreshes Word within ~1s (and vice versa), barring network delay.
- Local-to-server promotion happens before broadcast so the other platform can load the URL.
- No oscillation/loops when both platforms receive/broadcast events.

## Risks & mitigations
- Overwriting active edits: respect checkout ownership; require confirm when switching during active work.
- Autoplay/navigation constraints: doc loads are user-initiated or soft-init; avoid blocked behaviors.
- Event storms: debounce broadcasts and apply loop guards.

## Open questions
- Setting to disable auto-sync per user/tenant?
- Persist and restore “last opened document” across sessions (future)?

## References
- Web host: `web/view.html` (document mount and custom event listeners).
- Shared UI: `shared-ui/components.js` (dispatches `superdoc:open-url` and related hooks).
- Server: `GET /documents/default.docx`, `GET /api/v1/events`, `POST /api/v1/events/client`.
