Plain-English Summary

“View Latest” will be unified behind one reliable function. It will try to load the current document in this order:
1) Replace the content in-place inside the current Word document (best UX if it works).
2) Open the document using Word’s native protocol (ms-word) which is very reliable but opens a new document window where the add‑in may not auto-attach in dev.
3) Create a new document in Word from the file’s base64 and open it.

If all three fail, show one clear banner with options: replace the default .docx (upload), open in browser, copy link, or retry. We’ll test the logic so the order and fallbacks can’t change by accident.

Technical Breakdown

Target function and contract

- Exported orchestrator: openLatestDocument(options?)
  - Guards against re-entrancy (ignore while running)
  - Logs the path taken: 'replace' | 'protocol' | 'createDoc' | 'triple-fail'
  - Uses helper: getCurrentDocMeta() → { id, filename }
  - Uses helpers for each strategy (injected to enable unit tests):
    - impls.replace(): Promise<void>
    - impls.protocolOpen(url: string): Promise<void>
    - impls.createDocOpen(base64: string): Promise<void>

Strategy order (must remain stable)

1) In-place replace (primary)
   - Try in order with early success short‑circuit:
     - document.insertFileFromBase64 (normalized)
     - document.body.insertFileFromBase64(…, replace)
     - selection.insertFileFromBase64(…, replace)
     - Optional section-clear guard (clear extra sections, keep first, insert at start)
   - On success: show '✅ Inserted latest document'.

2) Protocol open (fallback #1)
   - Build URL: /api/document/:id.docx
   - ms-word:ofe|u|http://localhost:3001/api/document/:id.docx
   - On success: show '✅ Opened latest in a new window'.
   - Note: In dev sideload, the add‑in won’t auto-attach to the newly opened document; this is acceptable for a fallback.

3) CreateDocument open (fallback #2)
   - Fetch /api/document/:id as ArrayBuffer → base64
   - application.createDocument(base64).open()
   - On success: show '✅ Opened latest in a new document'.

Triple-fail error banner (exact copy)

Title: View Latest failed
Body: We couldn’t load the latest in this document. This often means the file has protection or section issues. Try replacing the default document with a fresh .docx.
Buttons:
- Replace default document: opens file picker; on upload → POST /api/replace-default → retry openLatestDocument()
- Open in browser: opens /api/document/:id.docx
- Copy link: copies /api/document/:id.docx to clipboard
- Retry: calls openLatestDocument(); debounced and re-entrancy guarded

Add-in wiring

- Dropdown 'View Latest' → openLatestDocument()
- Toolbar 'View Latest' → openLatestDocument()
- Remove/redirect any callers of viewLatestSafe/cleanViewLatest to the orchestrator

APIs used

- GET /api/current-document → { id, filename, filePath, lastUpdated }
- GET /api/document/:id.docx → binary docx (for protocol link and browser open)
- GET /api/document/:id → ArrayBuffer (for base64 conversion)
- POST /api/replace-default { base64Docx, originalFilename }

Testing plan (enforced to prevent regressions)

- Unit (pure logic): selectViewLatestStrategy(impls, env)
  - Asserts exact order: ['replace', 'protocol', 'createDoc']
  - Short-circuits on each success
  - Triple-fail returns a sentinel outcome
  - Re-entrancy: ignores concurrent calls and supports debounced retry
  - Protocol URL building tested (ms-word:ofe|u|…)

- UI (JSDOM):
  - Triple-fail renders one banner with 4 CTAs (Replace / Open / Copy / Retry)
  - Snapshot the banner copy so text changes are intentional
  - Verify Replace default triggers file input and, after mock upload, calls retry

- API smoke:
  - /api/current-document and /api/document/:id.docx return 200
  - /api/replace-default accepts base64 and responds with filename

Notes and caveats

- Protocol open is the most robust path but won’t auto-attach the add‑in in dev sideload; that’s acceptable as a fallback.
- Replace is optimal for UX but can fail due to canvas/protection; that’s why it’s first with strong fallbacks.
- Behavior is locked by tests; any change in order or copy requires updating tests.
 - If all strategies fail repeatedly, the practical resolution is to upload a fresh .docx as the default; the banner CTA facilitates this.


