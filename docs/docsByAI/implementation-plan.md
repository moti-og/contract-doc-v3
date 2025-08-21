# Implementation Plan (Prototype)

## Scope and constraints
- No auth, no database
- SuperDoc via CDN (no npm); one shared bootstrap module
- React via CDN for shared UI components; one server-served ES module consumed by both clients
- Single default document with upload/replace and revert-to-canonical
- Exhibits folder for packet assembly
- Identical contracts and rendering for Word add-in and Web; diverge only if required by platform

## Architecture baseline
- Server (Node, port 3001)
  - HTTPS with a trusted local dev certificate; host web and add-in from the same origin
  - Serves static assets (including a shared SuperDoc bootstrap module and a shared React UI module)
  - API: state matrix, document metadata, finalize/unfinalize, approvals (stub), uploads, exhibits
  - SSE endpoint for parity updates
  - Serves documents/exhibits from `data/app` (canonical) and `data/working` (mutable)
- Clients
  - Web: static HTML that mounts SuperDoc via CDN + shared bootstrap; renders shared React UI
  - Word add-in: taskpane HTML that does the same, hosted from the same server
  - Shared: zero duplicated init code; load one bootstrap module and one UI module from the server in both clients
- SuperDoc backend
  - Run locally in Docker at `https://localhost:4100` with CORS allowing `https://localhost:3001`

## File/folder map
- `server/public/superdoc-init.js`: exports `mountSuperdoc(options)`; calls `new SuperDoc(...)`
- `server/public/ui/components.js`: exports React components + `mountApp(...)`
- `clients/web/public/index.html`: contains `#superdoc-toolbar`, `#superdoc`, and `#app-root`; imports bootstrap and UI module
- `clients/addin/src/taskpane.html`: same divs; imports the same modules
- `clients/addin/manifest/manifest.xml`: taskpane manifest (served URLs on port 3001)
- `data/app/documents/default.docx`: canonical default document
- `data/app/exhibits/`: seed exhibits (optional)
- `data/working/`: uploads/temp/logs (ignored by VCS)

## Endpoints (prototype)
- GET `/api/health` -> `{ ok: true }`
- GET `/api/current-document` -> `{ id, filename, filePath, lastUpdated }`
- GET `/api/state-matrix?userRole&platform&userId&isCheckedOut&checkedOutBy` -> `{ config }` (stub)
- GET `/api/approvals/state?documentId` -> stub
- POST `/api/approvals/(approve|reject|add-user|reorder|update-notes)` -> 200 no-op
- POST `/api/finalize` | `/api/unfinalize` -> update in-memory state; emit SSE
- SSE `/api/events` -> server-sent events for parity
- Files
  - GET `/documents/default.docx`
  - GET `/exhibits/*`
  - POST `/api/document/upload` (replace working copy; keep canonical)
  - POST `/api/document/revert` (restore canonical)
  - POST `/api/exhibits/upload`

## SuperDoc integration (CDN)
Include in each client HTML:
- `<link href="https://cdn.jsdelivr.net/npm/@harbour-enterprises/superdoc/dist/style.css" rel="stylesheet">`
- `<script src="https://cdn.jsdelivr.net/npm/@harbour-enterprises/superdoc/dist/superdoc.es.js" type="module"></script>`
Both clients import `https://localhost:3001/static/superdoc-init.js` and call:
```
mountSuperdoc({
  selector: '#superdoc',
  toolbar: '#superdoc-toolbar',
  document: '/documents/default.docx',
  documentMode: 'editing',
  pagination: true,
  rulers: true
});
```

## Shared UI (React via CDN)
Include in each client HTML:
- `<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>`
- `<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>`
Then import and mount our shared module:
```
import { mountApp } from 'https://localhost:3001/static/ui/components.js';
mountApp({ rootSelector: '#app-root' });
```

## Phased tasks
1) Server scaffolding
- Minimal Node server with `/static/*`, `/documents/*`, `/exhibits/*`, `/api/health` over HTTPS
- In-memory store + optional JSON persistence helpers under `data/`
- Implement uploads (multipart), revert, and exhibits list/upload
- Stub state matrix and approvals; add SSE stream

2) Shared bootstrap + UI module
- Implement `server/public/superdoc-init.js` exporting `mountSuperdoc(options)`; log onReady/onEditorCreate
- Implement `server/public/ui/components.js` exporting shared React components and `mountApp(...)`
- Centralize default options (document path, pagination, rulers)

3) Web client
- Add `clients/web/public/index.html` with toolbar/editor/app divs
- Load SuperDoc CDN + bootstrap; load React CDN + UI module
- Verify default.docx loads; render a shared banner/modal placeholder

4) Word add-in
- Add `clients/addin/src/taskpane.html` and `manifest/manifest.xml` pointing to HTTPS server URLs
- Confirm taskpane mounts SuperDoc and shared UI via the same modules

5) File flows
- Validate upload new default, revert to canonical, exhibits upload/list
- Packet compile stub (JSON manifest or zip of exhibits) for later

6) Parity + SSE
- Emit SSE on finalize/unfinalize and upload/revert; clients subscribe (start with console logs)

## Acceptance (prototype)
- Both clients open the same default document via SuperDoc and render identically
- Upload/replace works; revert restores canonical
- Exhibits can be uploaded and listed
- Finalize/unfinalize reflected in state matrix and broadcast via SSE
- No auth, no DB; restart clears in-memory state (canonical files persist)

## Next: after infra
- Minimal approvals UI (stub) and finalize dialog using shared React modal
- Packet compile: from selected exhibits produce combined deliverable (manifest/zip)
- Basic smoke scripts in PowerShell

Reference: SuperDoc Quick Start — https://docs.superdoc.dev/
