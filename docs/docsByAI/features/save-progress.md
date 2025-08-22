### Save Progress

#### What it is
- Persist the current document during an active checkout without releasing the lock.
- Updates the working copy, bumps server revision, and broadcasts SSE so other clients refresh.

#### When the button shows
- State-matrix flag: `buttons.saveProgressBtn` should be true when:
  - Current user owns the checkout
  - Document is not finalized
  - Role permits saving during checkout

Reference: `docs/state-matrix-plain-english.md` (Button catalog: `saveProgressBtn`).

#### Server behavior (implemented)
- Endpoint: `POST /api/v1/save-progress`
- Checks:
  - 409 if not checked out or not owner
  - 409 if document is finalized
  - Validate payload (DOCX base64; quick `PK` signature check or equivalent)
- Effects:
  - Write to working copy (non-canonical), atomic where possible
  - Increment `serverState.revision`
  - `broadcast({ type: 'saveProgress', ... })` via SSE

#### Client behavior (implemented)
- Word add-in:
  - Capture current doc as base64 via Office.js (`insertFileFromBase64` inverse path)
  - `POST /api/save-progress` with `{ userId, base64 }`
- Web viewer:
  - Fallback: user can upload a `.docx` which is saved as working overlay
  - On SSE `saveProgress` or revision change, refresh UI (already supported)

#### Current repository status
- Implemented:
  - `buttons.saveProgressBtn` in state-matrix (true for owner checkout, not final)
  - `POST /api/v1/save-progress` endpoint with validations + revision bump + SSE
  - Client “Save Progress” button (Word export, web upload fallback)

#### Next steps
- Tests
  - Optional: E2E click-through to verify cross-client refresh timing
  - Optional: add stricter DOCX validation if needed


