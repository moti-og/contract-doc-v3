# Check‑in / Check‑out — Design and Implementation

## Why this feature exists (goals)
- Prevent write conflicts by enforcing single‑writer, multi‑reader semantics.
- Make status obvious across Word add‑in and Web: who has the doc, who can edit.
- Keep clients in sync via SSE and a single, server‑computed state matrix.

References: `docs/Project-Summary.md`, `docs/docsByAI/implementation-plan.md`, and the State Matrix plain‑English guide.

## High‑level behavior
- If no checkout exists, eligible users can check out the document (becoming the owner).
- While checked out by someone else, other users are read‑only (or suggesting if their role allows) and cannot check in/cancel.
- The owner can check in (or cancel) the checkout; finalize clears any checkout.
- The server computes and broadcasts the authoritative state. Clients render UI from the state matrix and do not “guess.”

## Roles and permissions (prototype)
- Editor: can check out, check in, cancel checkout, finalize/unfinalize.
- Suggestor/Vendor: read‑only or suggesting (cannot check out or check in).
- Viewer: view‑only.

Exact permissions flow through the state matrix and can be tuned in `data/app/users/roles.json`.

## Server responsibilities

### State model
- Tracked in memory with JSON persistence at `data/app/state.json`.
- Key fields (illustrative):
  - `isFinal: boolean`
  - `checkedOutBy: string | null` (userId)
  - `lastUpdated: number` (epoch ms)

### Endpoints (API v1)
- `POST /api/v1/checkout` → Body `{ userId }`
  - Preconditions: document not finalized; not currently checked out.
  - Effect: sets `checkedOutBy = userId`; emits SSE state update.
  - Response: `{ ok: true, state }`.

- `POST /api/v1/checkin` → Body `{ userId }`
  - Preconditions: `checkedOutBy === userId`.
  - Effect: clears `checkedOutBy`; emits SSE state update.
  - Response: `{ ok: true, state }`.

- `POST /api/v1/checkout/cancel` → Body `{ userId }`
  - Preconditions: `checkedOutBy === userId`.
  - Effect: clears `checkedOutBy`; emits SSE state update.
  - Response: `{ ok: true, state }`.

- `POST /api/v1/finalize` / `POST /api/v1/unfinalize`
  - Finalize clears any checkout; both emit SSE state updates.

Errors use `4xx` with `{ ok: false, error }` (e.g., conflict, forbidden).

### Events (SSE)
- Stream: `GET /api/v1/events` with retry and keepalive.
- On any state change (checkout, checkin, finalize): server broadcasts an event like `event: state\:update` with the new state snapshot.

## State Matrix mapping (what the clients consume)
The server computes a config bundle used by both clients. Relevant parts:

```json
{
  "buttons": {
    "checkoutBtn": true,
    "checkinBtn": false,
    "cancelBtn": false,
    "finalizeBtn": false,
    "unfinalizeBtn": false
  },
  "checkoutStatus": { "isCheckedOut": false, "checkedOutUserId": null }
}
```

Rules (summarized from implementation):
- `canWrite = !isCheckedOut || isOwner` where `isOwner = (checkedOutBy === userId)`.
- `checkoutBtn`: shown for roles that allow checkout when not checked out.
- `checkinBtn` and `cancelBtn`: shown only for the owner.
- `finalizeBtn`: enabled for editors when not final AND (not checked out OR owner); on finalize, checkout is cleared.
- `unfinalizeBtn`: enabled for editors when final.

### Document modes by role
- Mapping (shared UI):
  - viewer → `viewing`
  - suggestor/vendor → `suggesting`
  - editor → `editing`

The Web client applies this via a `superdoc:set-mode` event. If the doc is checked out by someone else, editors fall back to read‑only; otherwise they get `editing`.

## Client behavior (Web and Word add‑in)

### Shared UI module (`server/public/ui/components.js`)
- Renders user/role selectors, status, and a buttons grid.
- Fetches `/api/v1/state-matrix?userRole&platform&userId` and renders buttons according to `config.buttons`.
- On Checkout/Check‑in/Cancel click:
  - Calls the corresponding endpoint.
  - Requests a fresh state matrix and re-renders.
  - Dispatches `superdoc:set-mode` so Web switches between `editing`/`suggesting`/`viewing`.

### Web client (`server/public/view.html`)
- Mounts SuperDoc via `mountSuperdoc` with `documentMode` and modules (`comments`, `toolbar`).
- Listens for `superdoc:set-mode` to update the editor. If needed, remounts so modules (e.g., comments readOnly) match the mode.
- Toolbar is container‑responsive; a visible badge shows current mode.

### Word add‑in (taskpane)
- Loads the same shared UI module and follows the same state matrix.
- Checkout/Check‑in flows trigger server updates; Word surfaces advisory lock UI in the prototype.

## Edge cases and rules
- Simultaneous checkout attempts: first write wins; subsequent requests receive a conflict/forbidden response.
- Finalize/unfinalize: finalize clears checkout; unfinalize does not grant checkout.
- SSE resiliency: initial hello, retry interval, and keepalive ensure clients recover from restarts.

## Testing

### Manual
1) Start servers (4000 add‑in, 4001 backend, 4002 collab). Open Web and Word.
2) As Editor A, click “Checkout” → buttons change to Check‑in/Cancel; mode becomes `editing`.
3) As Editor B, verify checkout banner; no Check‑in/Cancel; mode is read‑only or suggesting based on role.
4) Click “Check in” as A → B sees unlock via SSE; “Checkout” becomes available again.
5) Finalize as A with self‑checkout → checkout cleared; finalize banner; buttons update.

### API examples (PowerShell)
```powershell
$base = "https://localhost:4001"
Invoke-RestMethod -Method Post -Uri "$base/api/v1/checkout" -ContentType 'application/json' -Body '{"userId":"user1"}'
Invoke-RestMethod -Method Post -Uri "$base/api/v1/checkin"  -ContentType 'application/json' -Body '{"userId":"user1"}'
```

### Automated
- Jest API tests cover checkout/checkin success and negative cases (wrong owner, already checked out), and finalize/unfinalize interactions. CI runs these on PRs.

## Future enhancements
- Expiring checkouts (auto‑release), admin override, and audit history.
- Section‑level locks; offline/merge handling; conflict resolution UI.
- E2E tests across add‑in and web for parity guarantees.


