# Feature: User Permissions (Roles, Modes, Actions)

This doc captures how permissions work today and what we’re standardizing next.

## 1) Document mode by role
- Goal: role determines the document mode.
  - editor: edit mode (can later toggle to suggest)
  - suggestor: suggestion‑only
  - viewer: view‑only
  - vendor: suggestion‑only (per current roles.json)
- Today: state‑matrix gates actions by role, but we haven’t passed an explicit mode to editors yet. Web always mounts SuperDoc in editing; Word uses native Word behavior when inserting file content.
- Next: add a small role→mode adapter used by both platforms.
  - Web: `mountSuperdoc({ documentMode: 'editing'|'suggesting'|'viewing' })`
  - Word: protect/read‑only for view, track‑changes for suggest, unprotect for edit.

## 2) Lock and mode parity in Web and Add‑in
- Web (SuperDoc): set `documentMode` at mount; optionally trim toolbar by state‑matrix (future).
- Word (Office.js): we already replace content via base64. We’ll add helpers to set protection/track‑changes to mirror the role’s mode consistently.

## 3) Workflow actions by role vs user
- Config files
  - Roles/permissions: `data/app/users/roles.json` (e.g., finalize, unfinalize, checkout, checkin)
  - Users: `data/app/users/users.json` → `{ id, label, role }`
- State‑matrix: enables buttons based on user role and checkout ownership.

Relevant server logic (excerpt):
```226:255:server/src/server.js
const rolePerm = roleMap[userRole] || {};
const config = {
  buttons: {
    finalizeBtn: !!rolePerm.finalize && !serverState.isFinal && canWrite,
    unfinalizeBtn: !!rolePerm.unfinalize && serverState.isFinal && canWrite,
    checkoutBtn: !!rolePerm.checkout && !isCheckedOut,
    checkinBtn: !!rolePerm.checkin && isOwner,
  },
  checkoutStatus: { isCheckedOut, checkedOutUserId: serverState.checkedOutBy },
};
```

Users + roles API (what the UI consumes):
```199:213:server/src/server.js
// /api/v1/users returns { items:[{id,label,role}], roles:{...} }
```

UI population (users list, role list, auto‑default to user’s role):
```react-entry
// fetch /api/v1/users and build dropdowns; selected user’s role is applied
```

## 4) Managing the logic (where to change it)
- Change role abilities: edit `data/app/users/roles.json`.
- Change who is who: edit `data/app/users/users.json`.
- Change button gating: edit `/api/v1/state-matrix` in `server/src/server.js`.
- Change UI population/labels: `/ui/components.react.js`.
- Add role→mode adapter (next): shared helper used by both Web (SuperDoc) and Word (Office.js).

## 5) Banner (centralized)
- Server computes a single `config.banner` in `/api/v1/state-matrix` with:
  - `state`: `available | checked_out_self | checked_out_other | final`
  - `title`, `message`: strings to display
- Styling tokens are delivered by `/api/v1/theme` (or `data/app/theme.json`):
  - For each state: `bg`, `fg`, `pillBg`, `pillFg`
- Clients (web + add‑in) simply render text and apply tokens; SSE events (`finalize`, `checkout`, `checkin`) trigger refresh.

## FAQ
- Are users and roles decoupled? Yes. A user points to a role; roles define permissions. You can add new roles (e.g., `suggestor`) in `roles.json` and they will appear in the role dropdown after reload; assign users to that role in `users.json`.
- Hidden logic? No—permissions flow strictly from `roles.json` and checkout ownership.

## Acceptance
- Role dropdown reflects roles in `roles.json` (e.g., `suggestor`).
- Buttons reflect role permissions and checkout state.
- Editors adopt role‑appropriate modes (once the adapter is in place).
