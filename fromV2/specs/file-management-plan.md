Plain-English Summary

This plan makes “View Latest” reliable and standardizes how we load, save, and update documents across the web viewer and Word add‑in. We unify all “open the latest document” actions behind one orchestrator that tries, in order: in‑place replace, then opening via the native Word protocol (ms‑word), and finally creating a new document within Word. If all three fail, we show a clear message and give the user direct options to fix it (replace the default .docx, open the file externally, copy the link, or retry). We also codify robust save/update flows, plus a finalize toggle that cleanly communicates and enforces “final/draft” state. Everything is covered by tests so the behavior won’t regress without intentional changes.

Technical Breakdown

1) View Latest: One Orchestrator (Add‑in)

- New function: openLatestDocument()
  - Purpose: single entry point for “View Latest” from dropdown and toolbar.
  - Order of attempts (exact):
    1. replace() → try in‑place replace in current doc (document.replace → body.replace → selection.replace; with section‑clear guard)
    2. protocol() → open via ms‑word:ofe|u|<doc-url>
    3. createDoc() → application.createDocument(base64).open()
  - Triple‑fail UX: show banner with CTAs
    - Replace default document (clicks hidden file input → calls POST /api/replace-default, then re‑runs openLatestDocument())
    - Open in browser (navigates to /api/document/:id.docx)
    - Copy link (copy /api/document/:id.docx to clipboard)
    - Retry (debounced)

- Implementation notes:
  - Guard against re‑entrancy with an in‑progress flag.
  - Log which strategy succeeded/failed for diagnostics.
  - Use existing helpers when present (insertDocxBase64Normalized, ensureBase64FromArrayBuffer).

- Wiring changes (Word add‑in):
  - Dropdown “View Latest” → openLatestDocument()
  - Toolbar “View Latest” → openLatestDocument()
  - Remove any direct calls to replace‑first helpers in dropdown paths.

2) Finalize Toggle (Web + Add‑in parity)

- Server: new finalize endpoints
  - POST /api/finalize { actorId }
  - POST /api/unfinalize { actorId }
    - Rules: editor‑only; must be self‑checked‑out
    - Effects: sets currentDocument.isFinal true/false; broadcasts SSE { type: 'document-finalize-updated', isFinal }

- State matrix payload additions
  - config.buttons.finalizeBtn / unfinalizeBtn (visible when editor and self‑checked‑out)
  - config.finalize: { isFinal: boolean, banner: string }

- Web UI
  - Dropdown adds Finalize / Move to Draft when allowed
  - On success: show notification only (no approver reminder automation)

3) Save / Update / Replace Flows

- Replace default document (web + add‑in)
  - POST /api/replace-default { base64Docx, originalFilename }
  - On success: immediately call openLatestDocument() to load the new default file

- Save progress + check‑in (web)
  - Extract content (SuperDoc) → save → check‑in per existing functions
  - Endpoints used: POST /api/update-document-json, POST /api/checkin, POST /api/checkout, POST /api/cancel-checkout

- Compile (web + add‑in)
  - POST /api/compile { primary, exhibitsById?, base64Pdf? }
  - DOCX→PDF uses runtime soffice locator (SOFFICE_BIN env, PATH, or known paths); health: GET /api/health/compile

4) APIs and Events (Reference)

- Document
  - GET /api/current-document → { id, filename, filePath, lastUpdated }
  - GET /api/document/:id.docx → streams .docx
  - POST /api/replace-default → replace default/current .docx
  - POST /api/update-document-json → persist docx payload

- Check‑out / Check‑in
  - POST /api/checkout, POST /api/override, POST /api/cancel-checkout, POST /api/checkin
  - SSE events: checkout‑updated, checkout‑cancelled

- Finalize
  - POST /api/finalize, POST /api/unfinalize
  - SSE: { type: 'document-finalize-updated', isFinal }
  - State matrix: buttons.finalizeBtn/unfinalizeBtn, finalize.isFinal, finalize.banner

- Approvals (unchanged here)
  - GET /api/approvals/state
  - POST /api/approvals/(approve|reject|remind|add-user|delete-user|reorder|update-notes)
  - SSE includes approved/total in all approval events

- Compile
  - POST /api/compile (primary current or base64 PDF; optional exhibitsById)
  - GET /api/health/compile (soffice detection)

5) Tests to Lock Behavior

- Unit: selectViewLatestStrategy(impls, env)
  - Asserts exact order: ['replace', 'protocol', 'createDoc']
  - Short‑circuit on success at each step
  - Triple‑fail returns a sentinel that triggers CTA banner
  - Re‑entrancy: ignores concurrent calls; debounced retry
  - Protocol URL is built as ms‑word:ofe|u|http://localhost:3001/api/document/:id.docx

- JSDOM UI tests
  - Triple‑fail shows banner with: Replace default, Copy link, Open in browser, Retry
  - Snapshot the banner copy to prevent accidental changes

- API smoke
  - /api/current-document, /api/document/:id.docx → 200 OK
  - /api/health/compile → { ok: true } or { ok: false, reason: 'soffice_not_found' }

6) Risk Mitigation

- Feature‑flag the orchestrator (window.__viewLatestProtocolFirst) for quick toggle
- Keep old helpers, but route callers through openLatestDocument()
- Clear, actionable user escape hatches if all strategies fail



Add-in DOCX Integrity and View Latest Orchestration — Implementation Notes
----------------------------------------------------------------------------

Why we saw “corrupted” current.docx
- The Word add-in exported the active document via Office.js slices, then naively flattened typed arrays and built a massive string before btoa(). For larger documents that approach can create malformed base64 (code-point truncation), resulting in a broken .docx written server-side.
- Some server endpoints (/api/save-progress, /api/checkin) accepted any PK-prefixed buffer and wrote it directly to disk, so malformed uploads could overwrite the canonical file.

Client-side fixes
- getDocumentAsBase64():
  - Merge slices into one contiguous Uint8Array (no array.flat on arbitrary slice structures).
  - Encode in small chunks (8KB) to a binary string, then btoa() once; avoids stack and code-point issues.
- View Latest (dropdown/toolbar) unified to a strict 3-step sequence:
  1) In-place base64 replace (pre-unlock document to reduce GeneralException; multiple insert strategies attempted).
  2) ms-word protocol fallback using: ms-word:ofe|u|http://localhost:3001/api/document/:id.docx
  3) Informative error banner with CTAs.
- Protocol URL must end with .docx for Office to consistently recognize it. We standardized on the .docx-suffixed streaming route.

Server-side fixes
- Added isWellFormedDocx(buffer) heuristic:
  - First: ZIP header (PK) and minimum size.
  - Then: scan for markers typical of a .docx package (e.g., [Content_Types].xml, word/document.xml). If absent, reject as invalid.
- Applied validation to /api/save-progress and /api/checkin before writing; existing /api/replace-default and /api/upload-docx already validate and/or write atomically.
- Kept writeFileAtomic for default replacement to avoid partial writes.

Tests to prevent regressions
- save-progress.test.js: rejects invalid base64 on save-progress/checkin; accepts well-formed docx-like payload (PK + markers) after checkout.
- replace-default.test.js: uses PK-prefixed payload to pass validation, asserts atomic write and metadata update.
- view-latest-robust.test.js (contract): dropdown wiring prefers viewLatestRobust and not legacy in-pane-only path.

Operational guidance
- If in-place insert fails repeatedly in a session, prefer protocol fallback then retry in-pane after Word loads the doc.
- When replacing the canonical doc, always use /api/replace-default (atomic write + validation). The add-in dropdown wires the hidden file input to this endpoint.
- If a DOCX becomes corrupted, immediately re-upload a good copy via Replace Default and verify View Latest protocol opens it successfully.

