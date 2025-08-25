# State Matrix – Plain‑English Guide (Single File)

This file explains, in plain English, what our “state matrix” is, what goes in, what comes out, and how buttons/flags are decided for the web viewer and the Word add‑in. It consolidates what’s in `api-server.js`, `state_matrix_api.js`, and `state-matrix-client.js` without code.

## What is the state matrix?
The state matrix is a server‑computed JSON bundle that tells the client exactly how to render the UI for the current user and document. It controls:
- Which actions (buttons/menu items) are visible/enabled
- Whether the document is finalized and what to show for confirm banners
- Approval UI flags
- Viewer message banners and simple checkout status

Clients apply this data the same way, so the web viewer and Word add‑in stay in sync.

## Inputs (what the server considers)
... (content duplicated from original)
