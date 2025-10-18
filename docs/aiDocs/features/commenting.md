# Feature: Commenting (Document Threads + External Messages)

## Status
- Proposal
- Platforms: Web (SuperDoc), Word add‑in
- Related: `Messages` tab (external), `Comments` tab (in‑document), activity system, permissions/roles

## Summary
Unify how users discuss a document by supporting two complementary channels:
- In‑document threads (SuperDoc comments) anchored to selections with resolve workflows.
- Out‑of‑document conversations (Messages) that are not embedded in the file.

Add first‑class support for:
- Unresolved counts and tab badges.
- Internal vs external visibility on every thread.
- Attorney‑client privilege marker and filtering/export rules.
- Clear UX to “put a comment in the document” or “keep it outside.”

## Problem Statement
Users need to:
- Comment on specific document text or discuss topics outside the doc.
- See total unresolved items at a glance.
- Mark certain threads as attorney‑client privileged.
- Choose visibility scope (internal vs external) per thread.
- Decide whether a discussion is embedded in the document or kept outside.

We currently have some of this split across the `Messages` tab (external, non‑embedded n:n communication) and `Comments` tab (embedded via SuperDoc). This feature formalizes the model, aligns the UX, and introduces server‑level summaries for parity across platforms.

## Goals
- Unified mental model: two locations for discussion, one consistent experience.
- Accurate unresolved counts across platforms; tab badges stay in sync.
- Per‑thread flags: `isInternal`, `isPrivileged` (attorney‑client), `resolved`.
- Export/print controls to suppress internal and/or privileged threads.
- Permissions respected by role (viewer/suggester/vendor/editor).

## Non‑Goals (v1)
- Cross‑document/global comments.
- Full comment moderation workflows or mentions.
- Advanced filtering/search UI (basic filters only in v1).

---

## Concepts
- Channel
  - Document Comments: Anchored to selections; rendered by SuperDoc inside the editor. Managed in the `Comments` tab right‑rail.
  - Messages: Freeform threads not embedded in the document; shown in the `Messages` tab.
- Visibility
  - Internal: Visible to internal org users only.
  - External: Visible to all collaborators (e.g., vendors).
- Privilege
  - `isPrivileged` indicates attorney‑client communications; can be filtered, hidden in external views, and excluded from exports.
- Resolution
  - Threads can be marked `resolved` (document comments use the SuperDoc resolve workflow). Resolved threads drop from unresolved counts.

---

## Data Model

### Document Comments (SuperDoc‑native)
We leverage SuperDoc’s comment object and extend via metadata where needed.

"comment" (source: SuperDoc) with additional flags we rely on:
```json
{
  "commentId": "uuid",
  "commentText": "<p>Text</p>",
  "parentCommentId": null,
  "creatorName": "Warren Peace",
  "creatorEmail": "warren@example.com",
  "createdTime": 1700000000000,
  "isInternal": true,
  "resolvedTime": null,
  "resolvedByEmail": null,
  "resolvedByName": null,
  "trackedChange": false,
  "meta": {
    "isPrivileged": false
  }
}
```
Notes:
- Internal/external: use SuperDoc `useInternalExternalComments` and the `isInternal` field.
- Privilege: stored under `meta.isPrivileged` (preserved when saving/round‑tripping the doc). If SuperDoc exposes a first‑class field later, map to it.

### External Messages (server‑managed)
Threads persisted server‑side (not embedded):
```json
{
  "threadId": "msg-123",
  "channel": "messages",
  "isInternal": false,
  "isPrivileged": false,
  "resolved": false,
  "createdBy": { "userId": "user1", "label": "Warren Peace" },
  "createdAt": 1700000000000,
  "title": "Vendor question about SOW",
  "posts": [
    { "postId": "p1", "text": "Please confirm dates", "author": {"userId":"user2","label":"Jane"}, "createdAt": 1700000001000 }
  ]
}
```

### Server Summary (parity + badges)
A single summary object returned to clients for tab badges:
```json
{
  "comments": { "total": 18, "unresolved": 6, "internalUnresolved": 5, "externalUnresolved": 1, "privileged": 2 },
  "messages": { "total": 12, "open": 3, "internalOpen": 1, "externalOpen": 2, "privileged": 1 }
}
```

---

## API Surface (v1)
Minimal endpoints to support counts, filters, and parity.

- GET `/api/v1/discussion/summary`
  - Returns the summary object above. Server computes from sources below.
- GET `/api/v1/messages`
  - Returns external message threads (with filters: `?internal=false&privileged=false&resolved=false`).
- POST `/api/v1/messages` (create thread)
- POST `/api/v1/messages/:threadId/post` (add reply)
- POST `/api/v1/messages/:threadId/resolve` (set `resolved=true`)
- POST `/api/v1/messages/:threadId/flags` (toggle `isInternal`, `isPrivileged`)
- SSE: `discussion:update` broadcast when any comment/message changes; payload includes updated summary for fast badge updates.

Notes on comments source:
- For document comments, clients (web/add‑in) surface SuperDoc comment events. We maintain an in‑memory index on the server per document by accepting client sync pings:
  - POST `/api/v1/comments/sync` with `{ counts, lastKnownAt }` emitted on editor ready and on change. This keeps summary light‑weight without parsing DOCX server‑side.
  - Future: when SuperDoc exposes list APIs server‑side, migrate to server reading from document to avoid client sync.

---

## UX & Workflows

### Tabs and Badges
- `Comments` tab: shows unresolved count badge from `summary.comments.unresolved`.
- `Messages` tab: shows open count badge from `summary.messages.open`.

### Creating a Thread
- In document: select text → add comment. Default flags per role:
  - Internal by default; privileged off. Users can toggle both before posting.
- Outside document: `Messages` → “New Thread”. Same flag controls present.

### Flag Controls (per thread)
- Visibility: Internal/External toggle.
- Privilege: Attorney‑client privilege toggle. If on, apply special badge, hide from external users, and exclude from exports by default.
- Resolution: Mark resolved/unresolved. Resolved drops from badges.

### Filters (panel header)
- Channel tabs already split: Comments vs Messages.
- Quick filters: [All | Internal | External] and [All | Privileged only].
- Search (v2).

### Export/Print Behavior
- Default: Exclude `isPrivileged===true` and all `isInternal===true` when exporting/sharing externally.
- Provide explicit checkboxes in export dialogs: “Include internal comments” and “Include privileged comments”.

---

## Permissions (roles.json driven)
- Viewer: view external comments/messages; cannot post or resolve; cannot see internal or privileged unless explicitly allowed.
- Suggestor/Vendor: create external comments/messages, reply, resolve own; cannot view internal or privileged.
- Editor: full access; can toggle flags and resolve any thread.
- Server enforces visibility on `GET /messages`, and clients suppress controls based on role.

---

## Activity & Telemetry
- Log to activity log on create, reply, resolve, flag changes.
- Record counts snapshot in the event for quick audit: `{ after: { comments.unresolved, messages.open } }`.
- SSE `discussion:update` emitted with new summary; clients update tab badges immediately.

---

## Implementation Plan

### Phase 1 — Parity & Badges
- Wire Comments tab to SuperDoc (done).
- Add `discussion:summary` client aggregator on ready/change → POST `/api/v1/comments/sync`.
- Add `/api/v1/discussion/summary`; server aggregates `comments` from sync and `messages` from storage.
- Show badges on `Comments` and `Messages` tabs.

### Phase 2 — Flags & Filters
- Add thread flags to Messages CRUD and UI controls.
- Add privileged/internal toggles for document comments via comment metadata on create/edit.
- Panel filters for Internal/External and Privileged.

### Phase 3 — Exports & Permissions Polish
- Respect flags in export/print.
- Enforce server‑side visibility for messages; suppress UI for hidden content.

### Phase 4 — Server‑side Comment Index (optional)
- Replace client sync with server reading comments directly when supported by SuperDoc, removing the `/comments/sync` dependency.

---

## Acceptance Criteria
- Badges reflect unresolved/open counts and update in real time via SSE.
- Users can set Internal/External and Privileged on both channels.
- Privileged/Internal discussions are hidden from external users and excluded from exports by default.
- Resolving a thread updates counts immediately and moves the thread out of “unresolved/open” lists.
- Word add‑in and Web remain in sync for summaries and visibility rules.

---

## Files of Record
- Client: `shared-ui/components.react.js` (tab badges, filters, controls)
- Web host: `web/superdoc-init.js` (comments integration)
- Server: `server/src/server.js` (summary endpoint, messages CRUD, SSE)
- Data: `data/app/messages.json` (new), existing DOCX holds SuperDoc comments

---

## Open Questions
- Do we ever expose privileged threads to select external counsel (per‑user exceptions)?
- Should Messages support attachments? (out of scope v1)
- Should we persist the SuperDoc comment metadata server‑side as an index for analytics? (v2)
