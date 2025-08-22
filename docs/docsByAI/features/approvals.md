# Feature: Approvals (Simple Model)

## Summary
- Purpose: lightweight approvals where every user can approve for themselves; editors can override others with confirmation.
- Scope: shared UI (Web + Word taskpane) reading from a single source of truth; minimal server API to persist and broadcast changes.
- Core rules:
  - Every user in the system is an approver.
  - Each user can toggle their own Approved checkbox and add a note for context.
  - Editors can override any user’s Approved state (must confirm first).
  - “Remind” is a non-blocking ping (no email integration in prototype) and is tracked as a client event.

## State Matrix mapping
- `approvals.enabled: true` — always on in this simple model.
- `approvals.summary: { approved, total }` — computed counts used for the pill (e.g., “2/5 approved”).
- The state matrix remains the contract for rendering entry points and pills; the detailed table comes from the approvals API.

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
  - Click Remind on any row (non-destructive ping) — optional; can be limited to editors-only if desired.
- Editors:
  - Can toggle any user’s Approved checkbox (override) but must confirm in a modal.
  - Can reset the entire list (Nuke it) — confirm required.
  - Can add users (from the system users list) if the list needs to expand (optional in prototype).

## UX (modal/table)
- Header: “Approvals (X/Y approved)”
- Toolbar buttons:
  - Add user (optional), Refresh, Nuke it (confirm), Close
- Table columns:
  - Order (1..N) — display only; server normalizes if reordering is supported later
  - Human (name)
  - Approved (checkbox)
  - Remind (button)
  - Notes (free text)

Interactive behaviors:
- Self-approval: user checks their own box → persists immediately → updates summary and broadcasts.
- Notes: save-on-blur (or explicit save) for the user’s own row.
- Override (editor): clicking another user’s checkbox prompts “Override approval for {name}?” → Confirm/Cancel. On confirm, persist and broadcast.
- Nuke it (editor): confirm “Reset all approvals?” → sets all `approved=false` and clears notes (optional), then broadcast.
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
- `GET /api/v1/approvals?documentId` → returns current list with `{ approvers:[...], documentId }`.
- `POST /api/v1/approvals/set` → body `{ documentId, targetUserId, approved, notes?, actorUserId }`
  - Authorization:
    - If `actorUserId === targetUserId`, allow self-approval changes.
    - Else require actor role `editor` and show confirm in client before calling.
  - Side-effects: persist; recompute summary; `broadcast({ type: 'approvals:update', documentId })`.
- `POST /api/v1/approvals/reset` (editor only) → body `{ documentId, actorUserId }`
  - Effect: set all `approved=false` (and optionally `notes=''`), normalize order, broadcast.
- `POST /api/v1/approvals/remind` → body `{ documentId, targetUserId, actorUserId }`
  - Prototype: no-op + broadcast `{ type: 'approvals:remind', targetUserId }` for UI toast/log.

## Client behavior
- Load list on open and subscribe to SSE events.
- Update in-place on `approvals:update` / `approvals:reset` events.
- For self-approval, submit immediately on checkbox change; on error, revert and show toast.
- For overrides, show confirm modal before submitting.
- Update the state-matrix pill (`X/Y approved`) after each successful change.

## Acceptance criteria
- Everyone can toggle their own Approved checkbox and edit their Notes.
- Editors can override others with a confirmation prompt.
- Summary counts update instantly and match the table (`X/Y`).
- SSE keeps Web and Word taskpane views in sync without manual refresh.
- Reset (Nuke it) sets all approvals to false and clears notes (if included), with confirmation.

## Edge cases
- User removed from the system: keep the row but mark as inactive; editors can remove it.
- Duplicate entries: server normalization removes duplicates by `userId`.
- Concurrent edits: last write wins; clients reconcile on SSE update.

## Telemetry (optional)
- `approvals.toggle` with `{ actorUserId, targetUserId, approved }`.
- `approvals.override.confirmed` with `{ actorUserId, targetUserId }`.
- `approvals.reset` and `approvals.remind` for audit.

## References
- State Matrix: `approvals.enabled`, `approvals.summary` (see `docs/state-matrix-plain-english.md`).
- UI layout: based on the attached screenshot (Order, Human, Approved, Remind, Notes) with header controls.
