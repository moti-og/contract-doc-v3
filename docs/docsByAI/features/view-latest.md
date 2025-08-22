# Feature: View Latest

Purpose
- Load the canonical default document (not the working overlay) into the editor surface.
- Available in both Web and Word add‑in; no server state mutation.

State-machine
- No transitions. `GET /api/v1/state-matrix` is only used to render the rest of the UI; View Latest is always enabled (not gated by `isFinal` or checkout status).
 - Related signals used by the client for layout: `viewerMessage`, `banner` (text from server; styles from theme).

Endpoints
- Canonical document: `GET /documents/canonical/default.docx`
- Working document (for parity/testing): `GET /documents/working/default.docx`
- Overlay resolver (used elsewhere): `GET /documents/default.docx` (prefers working when present)

Web behavior
- The shared UI dispatches a custom event; the host page remounts SuperDoc with the canonical URL.
  - Dispatch: `window.dispatchEvent(new CustomEvent('superdoc:open-url', { detail: { url: '/documents/canonical/default.docx' } }))`
  - Host listener remounts SuperDoc with the provided URL and resets toolbar/editor nodes for a clean mount.

Word add‑in behavior
- The shared UI downloads the canonical DOCX, converts to Base64, then replaces the current document via Office.js:
  - `Word.run(ctx => ctx.document.body.insertFileFromBase64(base64, Word.InsertLocation.replace))`

Files of record
- UI (React right‑pane): `/ui/components.react.js` (web dispatch + Word insert)
- Web host remount: `server/public/view.html`
- Server routes for canonical/working/default: `server/src/server.js`

Notes
- This feature does not change `serverState` nor emit state events. It is a view operation only.


