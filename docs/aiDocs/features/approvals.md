# Feature: Approvals (Simple Model)

## Summary
- Purpose: lightweight approvals where every user can approve for themselves; editors can override others with confirmation.
- Scope: shared UI (Web + Word taskpane) reading from a single source of truth; minimal server API to persist and broadcast changes.
- Core rules:
  - Every user in the system is an approver.
  - Each user can toggle their own Approved checkbox and add a note for context.
  - Editors can override any user’s Approved state (must confirm first).
  - “Message” is a non-blocking ping (prototype) and is tracked as a client event.

## State Matrix mapping
- `approvals.enabled: true` — always on in this simple model.
- `approvals.summary: { approved, total }` — computed counts used for the pill (e.g., “2/5 approved”).
- The state matrix remains the contract for rendering entry points and pills; the detailed table comes from the approvals API.
- Pill and table must be identical and update together:
  - Single source of truth is the approvals list for the current document.
  - The pill value is computed from the same dataset as the table (either computed client‑side from the fetched list or returned alongside it by the API).
  - A shared `revision` accompanies both the list and the summary; SSE events carry the `revision` so clients update atomically.

Example signals:
```json
{
  "approvals": {
    "enabled": true,
    "summary": { "approved": 2, "total": 5 }
  }
}
```

## Roles & permissions
- All users (viewer/suggestor/vendor/editor):
  - See the approvals list and their own row.
  - Toggle their own Approved checkbox; edit their own Notes.
  - Click Message on any row (non-destructive ping)
- Editors:
  - Can toggle any user’s Approved checkbox (override) but must confirm in a modal.

## UX (modal/table)
- Entry points:
  - Click the approvals pill (e.g., “X/Y approved”) to open the Approvals modal.
  - Optional: menu/toolbar entry also opens the same modal.
- Header: “Approvals (X/Y approved)”
- Toolbar buttons:
  - Refresh, Request review, Factory reset (confirm), Close
- Table columns:
  - Order (1..N) — display only; server normalizes if reordering is supported later
  - Human (name)
  - Approved (checkbox)
  - Message (button)
  - Notes (free text)

Interactive behaviors:
- Self-approval: user checks their own box → persists immediately → updates summary and broadcasts.
- Notes: save-on-blur (or explicit save) for the user’s own row.
- Override (editor): clicking another user’s checkbox prompts “Override approval for {name}?” → Confirm/Cancel. On confirm, persist and broadcast.
- Message: clicking Message logs/sends a lightweight ping (prototype) → broadcast for parity/toasts.
- Request review: clicking “Request review” sends a non-destructive broadcast to all approvers that it’s time to review.
  - Success toast: “Requested review from X approvers”.
  - Optional pill affordance: transient tag under pill text (e.g., “Notified • 1m”).
- Factory reset: confirm “Factory reset this document?” → resets working overlays AND approvals (sets all `approved=false` and clears notes if included), normalize order, then broadcast.
- Refresh: re-fetch list; typically unnecessary because SSE will keep clients in sync.

## Data model (prototype)
- Persisted list per document:
```json
{
  "documentId": "doc-current",
  "approvers": [
    { "userId": "user1", "name": "Warren Peace", "order": 1, "approved": true,  "notes": "LGTM" },
    { "userId": "user2", "name": "Fun E. Guy",   "order": 2, "approved": true,  "notes": "" },
    { "userId": "user3", "name": "Gettysburger", "order": 3, "approved": false, "notes": "" }
  ]
}
```
- Summary is derived: `approved = approvers.filter(a => a.approved).length`, `total = approvers.length`.
- Order is 1..N; server normalizes after any change.

## API (prototype)
- `GET /api/v1/approvals?documentId` → returns `{ approvers, summary, revision }`.
- `POST /api/v1/approvals/set` → body `{ documentId, targetUserId, approved, notes?, actorUserId }` → returns `{ approvers, summary, revision }`.
- `POST /api/v1/approvals/reset` → body `{ documentId, actorUserId }` → returns `{ approvers, summary, revision }`.
- `POST /api/v1/approvals/notify` (non-destructive) → body `{ documentId, actorUserId }` → returns `{ approvers, summary, revision }` (unchanged) and broadcasts a review notice.

Notes:
- SSE: after any write/notify, server emits one event `approvals:update` with `{ revision, summary, notice? }`.
  - `notice` is optional metadata for ephemeral UI (e.g., `{ type: "request_review", by: "userId" }`).
  - Clients update immediately from the write response and may show a toast when `notice` is present.

## Client behavior
- When the pill is clicked, open the Approvals modal.
- Debounce: disable the pill for ~300ms after click to prevent double-open.
- Load list on open and subscribe to SSE events.
- On successful write (set/reset/notify/message):
  - Update the table and pill from the response `{ approvers, summary, revision }` immediately.
  - Close the modal by default (or keep open behind a setting) and show a small confirmation toast.
- Update in-place on `approvals:update` events, keyed by `revision`; show ephemeral toast if `notice` exists.
- For self-approval, submit immediately on checkbox change; on error, revert and show toast.
- For overrides, show confirm modal before submitting.
- Update the pill (`X/Y approved`) by recomputing from the same list data used for the table.

## Acceptance criteria
- Clicking the approvals pill opens the Approvals modal.
- Pill and table reflect the same data and update atomically (shared `revision`).
- Write endpoints return `{ approvers, summary, revision }`, and clients reflect changes immediately without waiting for SSE.
- “Request review” button is visible when `total > 0`, posts notify, and shows confirmation toast; other clients see a toast via SSE `notice`.
- Everyone can toggle their own Approved checkbox and edit their Notes.
- Editors can override others with a confirmation prompt.
- SSE keeps Web and Word taskpane views in sync without manual refresh.
- Factory reset is available to all users and resets approvals state in addition to document working overlays.

## Edge cases
- User removed from the system: keep the row but mark as inactive; editors can remove it.
- Duplicate entries: server normalization removes duplicates by `userId`.
- Concurrent edits: last write wins; clients reconcile on SSE update.

## Telemetry (optional)
- `approvals.toggle` with `{ actorUserId, targetUserId, approved }`.
- `approvals.override.confirmed` with `{ actorUserId, targetUserId }`.
- `approvals.notify` with `{ actorUserId, totalNotified }`.
- `approvals.reset`, `approvals.message` for audit, and `modal.open/close` with `{ reason: 'pill'|'write-success' }`.
- `factoryReset` with `{ actorUserId }` and counts before/after.
