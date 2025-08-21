# State Matrix – Plain‑English Guide (Single File)

This file explains, in plain English, what our “state matrix” is, what goes in, what comes out, and how buttons/flags are decided for the web viewer and the Word add‑in. It consolidates what’s in `api-server.js`, `state_matrix_api.js`, and `state-matrix-client.js` without code.

## What is the state matrix?
The state matrix is a server‑computed JSON bundle that tells the client exactly how to render the UI for the current user and document. It controls:
- Which actions (buttons/menu items) are visible/enabled
- The label/order of actions in the “Document actions” dropdown
- Whether the document is finalized and what to show for confirm banners
- Approval UI flags
- Viewer message banners and simple checkout status

Clients apply this data the same way, so the web viewer and Word add‑in stay in sync.

## Inputs (what the server considers)
The server computes the matrix from:
- User role and identity (e.g., editor, vendor)
- Platform (web or word) – used mainly for small differences and feature flags
- Document state (checked out? by whom? finalized?)
- Feature toggles (e.g., new‑feature banner; templates/OpenGov buttons)

## Output (high‑level shape)
The server returns an object (fields may be omitted when not relevant):

```json
{
  "buttons": {
    "viewOnlyBtn": true,
    "shareToWebBtn": true,
    "templatesBtn": true,
    "openGovBtn": true,
    "checkoutBtn": false,
    "checkinBtn": false,
    "cancelBtn": false,
    "saveProgressBtn": false,
    "overrideBtn": false,
    "sendVendorBtn": false,
    "replaceDefaultBtn": true,
    "compileBtn": true,
    "approvalsBtn": true,
    "finalizeBtn": false,
    "unfinalizeBtn": false,
    "checkedInBtns": false
  },
  "dropdown": {
    "order": [
      "viewOnlyBtn","shareToWebBtn","templatesBtn","openGovBtn",
      "checkoutBtn","checkinBtn","cancelBtn","saveProgressBtn",
      "overrideBtn","sendVendorBtn","replaceDefaultBtn",
      "compile","approvalsBtn","finalize","unfinalize"
    ]
  },
  "finalize": {
    "isFinal": false,
    "banner": { "title": "…", "message": "…" },
    "confirm": { "title": "Finalize?", "message": "…" },
    "unfinalize": { "title": "Unlock?", "message": "…" }
  },
  "approvals": { "enabled": true },
  "checkoutStatus": { "isCheckedOut": false, "checkedOutUserId": null },
  "viewerMessage": { "type": "info", "text": "…" }
}
```

Notes:
- Not every field is always present. The client code is tolerant to missing sections.
- `buttons.*` are simple boolean flags that drive visibility/enabled state.
- `dropdown.order` can be provided by the server; otherwise the client uses a default fallback order (see below).

## Button catalog (what each flag means)
- `viewOnlyBtn` – Open the latest version read‑only in the current surface.
- `shareToWebBtn` – Share link/open the viewer on the web.
- `templatesBtn` – Open “Templates” UI.
- `openGovBtn` – Open the “Take Me Back to OpenGov” modal.
- `checkoutBtn` – Check out the document (when available and not already checked out).
- `checkinBtn` – Check in (when the current user has it checked out).
- `cancelBtn` – Cancel a checkout (when the current user has it checked out).
- `saveProgressBtn` – Save progress during checkout if supported.
- `overrideBtn` – Force checkout (admin/editor capability; usually hidden for vendors).
- `sendVendorBtn` – Open “Send to Vendor” flow (only for editors on web; hidden for vendors).
- `replaceDefaultBtn` – Replace the default document (upload in viewer/add‑in).
- `compileBtn` – Compile exhibits/packet.
- `approvalsBtn` – Open approvals panel.
- `finalizeBtn` – Finalize (only when editor has self‑checkout and doc is not final).
- `unfinalizeBtn` – Unlock (only editors; doc must be final).
- `checkedInBtns` – Convenience flag used by the client to show the non‑checkout group when you don’t own a checkout.

## Default dropdown order (client fallback)
If the server does not provide `dropdown.order`, the client uses this fallback sequence (left‑to‑right is top‑to‑bottom in the dropdown):

```
viewOnlyBtn, shareToWebBtn, templatesBtn, openGovBtn,
checkoutBtn, checkinBtn, cancelBtn, saveProgressBtn,
overrideBtn, sendVendorBtn, replaceDefaultBtn,
compile, approvalsBtn, finalize, unfinalize
```

The client filters this list to only include buttons whose flags are true.

## Key rules the server applies (summarized)
- Role‑gated actions
  - Editors can check out, check in, finalize/unfinalize, manage approvals.
  - Vendors see only read‑only and any allowed vendor‑specific actions.
- Checkout logic
  - If the document is not checked out: show `checkoutBtn` (for editors), hide check‑in/cancel.
  - If checked out by the current editor: show `checkinBtn`/`cancelBtn` and editor‑only controls.
  - If checked out by someone else: hide override for vendors; typically hide check‑in/cancel; show a banner message.
- Finalize logic
  - `finalizeBtn` requires editor role and self‑checkout; when finalizing, checkout is cleared.
  - `unfinalizeBtn` is available to editors even without checkout.
- Feature toggles
  - `templatesBtn`/`openGovBtn` are enabled by server flags and included in dropdown order.

## Examples

### 1) Editor, not checked out, not final (Word)
```json
{
  "buttons": {
    "viewOnlyBtn": true,
    "templatesBtn": true,
    "openGovBtn": true,
    "checkoutBtn": true,
    "replaceDefaultBtn": true,
    "compileBtn": true,
    "approvalsBtn": true,
    "finalizeBtn": false,
    "unfinalizeBtn": false
  },
  "finalize": { "isFinal": false }
}
```

Why: editor can start checkout; finalize is hidden until they have self‑checkout.

### 2) Editor, checked out by self, not final (Web)
```json
{
  "buttons": {
    "checkinBtn": true,
    "cancelBtn": true,
    "replaceDefaultBtn": true,
    "compileBtn": true,
    "approvalsBtn": true,
    "finalizeBtn": true
  },
  "checkoutStatus": { "isCheckedOut": true, "checkedOutUserId": "user1" },
  "finalize": { "isFinal": false }
}
```

Why: editor owns the checkout, so finalize is allowed; check‑in/cancel visible.

### 3) Vendor (Web)
```json
{
  "buttons": {
    "viewOnlyBtn": true,
    "templatesBtn": true,
    "openGovBtn": true,
    "replaceDefaultBtn": true,
    "compileBtn": true
  },
  "approvals": { "enabled": false }
}
```

Why: vendors do not get checkout or finalize controls.

### 4) Approvals – what the matrix conveys and what the endpoint returns

Approvals have two layers of data:
- In the state matrix: a simple enable/disable signal and lightweight summary so the UI knows to show the Approvals entry points.
- From the approvals API: the detailed list (order, status, notes) used to render the table and pills.

State‑matrix signals (typical):
```json
{
  "approvals": {
    "enabled": true,
    "summary": { "approved": 2, "total": 5 }
  }
}
```

Detailed list (from the approvals API, summarized):
```json
{
  "documentId": "doc-current",
  "approvers": [
    { "userId": "user1", "name": "Warren Peace", "order": 1, "status": "approved", "notes": "LGTM" },
    { "userId": "user2", "name": "Fun E. Guy",   "order": 2, "status": "approved", "notes": "" },
    { "userId": "user3", "name": "Gettysburger", "order": 3, "status": "none",     "notes": "" },
    { "userId": "user4", "name": "Yuri Lee",      "order": 4, "status": "none",     "notes": "" },
    { "userId": "vendor1","name": "Hoo R. U",     "order": 5, "status": "none",     "notes": "" }
  ]
}
```

Rules in plain English:
- Editors see Approvals enabled; vendors typically do not (read‑only experience).
- Reordering is allowed for editors; the backend normalizes the order (1..N) and broadcasts updates.
- Status values are `none`, `approved`, or `rejected`. Changing a status updates the summary counters the server sends back (e.g., approved 2 of 5).
- Notes can be attached/updated per row (audit/history stored on the server).

UI outcomes:
- If `approvals.enabled` is false, the Approvals button is hidden/disabled in the dropdown.
- If true, the UI shows the Approvals panel; the pill in the taskpane/web header can display `2/5 approved` using the summary.

## Action reference (what the button does in practice)

- Check‑out / Check‑in / Cancel
  - Matrix flags: `checkoutBtn`, `checkinBtn`, `cancelBtn`, `checkedInBtns` (group)
  - Client: shows the right group based on ownership of the checkout; calls the server to update checkout state; UI refreshes via SSE/matrix reload
  - Server: tracks `documentState.isCheckedOut` and the `checkedOutUserId`; enforces “self‑checkout only” rules for privileged actions

- View Latest (read‑only)
  - Matrix flag: `viewOnlyBtn`
  - Client (Word): `cleanViewLatest()` / `viewLatestSafe()` load the latest DOCX
  - Server endpoints: `GET /api/get-updated-docx` (base64) or `GET /api/document/:id(.docx)` (bytes)

- Finalize / Unlock
  - Matrix flags: `finalizeBtn`, `unfinalizeBtn`; `finalize.isFinal` drives state
  - Client: shared confirm modal (`openFinalizeToggleModal`) then calls the server
  - Server endpoints: `POST /api/finalize`, `POST /api/unfinalize` (editor‑only; finalize clears checkout)

- Replace default document
  - Matrix flag: `replaceDefaultBtn`
  - Client: upload/replace flow in viewer/add‑in; atomic write on Windows to avoid file‑in‑use errors
  - Server: receives DOCX upload via multer storage and consolidates to `default-document/current.docx`

- Compile (exhibits/packet)
  - Matrix entry: `compile` in dropdown order; `compileBtn` flag
  - Client: invokes compile; shows health status if LibreOffice isn’t configured
  - Server: compile health at `GET /api/health/compile` (LibreOffice `soffice --version`)

- Approvals
  - Matrix: `approvals.enabled` + summary (optional)
  - Client: shows approvals panel and summary pill (e.g., `2/5 approved`); reorders and updates statuses
  - Server: stores per‑document approver list, normalizes order, and broadcasts changes; reset via `POST /api/approvals/reset`

- Templates / “Take me back to OpenGov” / Share to Web
  - Matrix flags: `templatesBtn`, `openGovBtn`, `shareToWebBtn`
  - Client: opens the corresponding modals or navigations; purely UI in this prototype
  - Server: can expose feature toggles to enable/disable these entries

## Where this is implemented (for reference only)
- Server logic: `api-server.js` computes flags (roles, checkout ownership, isFinal, feature toggles) and returns the matrix.
- API surface: `state_matrix_api.js` contains helper/contract notes for the matrix (naming/shape utilities).
- Client application: `state-matrix-client.js` consumes the JSON and builds the dropdown/modal behavior for both web and add‑in.

## TL;DR
Think of the matrix as “the single source of truth for what the UI should show right now.” If you change the server rules or feature flags, both clients update the same way. If you change the shared client renderer, both clients look and behave the same way.


