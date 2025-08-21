Title: DOCX Integrity in Word Add-in and Robust “View Latest” Orchestration
Date: 2025-08-15

Summary
- Word add-in exports and server writes led to occasional corrupted current.docx. We fixed the client assembly and hardened server validation. We also enforced the 3-step “View Latest” flow (in-place → protocol → error banner) and standardized the protocol URL.

Root Causes
1) Base64 assembly in the add-in used array flattening and giant string concatenation, which can produce malformed base64 for large typed arrays.
2) Server endpoints (/api/save-progress, /api/checkin) wrote whatever base64-decoded bytes they received, with only a minimal PK header check elsewhere.
3) Protocol fallback sometimes used a non-.docx URL, which the Office handler may ignore or misinterpret.

Fixes
- Client
  - Rewrote getDocumentAsBase64() to merge slices into a single Uint8Array and encode in 8KB chunks before btoa().
  - Unified dropdown/toolbar wiring to call viewLatestRobust, which executes: in-place base64 insert → ms-word:ofe|u|http://localhost:3001/api/document/:id.docx → informative error.
- Server
  - Added isWellFormedDocx(): ZIP header + presence of [Content_Types].xml and word/document.xml markers.
  - Applied to /api/save-progress and /api/checkin; reject invalid_docx, preventing corrupted writes.
  - Kept atomic write for /api/replace-default.

Operational Notes
- If in-place repeatedly fails with GeneralException, rely on ms-word protocol to open a clean copy, then retrace in-place if needed.
- Always replace the canonical file via /api/replace-default from the add-in (hidden file input) to benefit from validation + atomic write.

Tests
- save-progress.test.js: rejects invalid, accepts well-formed docx-like payloads post-checkout.
- replace-default.test.js: validates atomic write of current.docx and updated metadata.
- view-latest-robust.test.js: contract test to ensure dropdown wiring prefers the robust path.

Follow-ups
- Consider adding a quick ZIP central directory reader to validate structure more strongly without full unzip.
- Add a health endpoint for DOCX integrity that returns size, last write method, and quick structural checks.


