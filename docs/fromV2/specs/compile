add another entry in the "document actions" dropdown

the name of the entry will be Compile

the purpose of this feature is to allow users to append documents onto their word document

so someone will click Compile and a modal will appear

in the modal there should be a table;
in the table:
rows are files
columns are: file name, include, and order

columns:
file name: strings
include: checkbox in yes/no state, default to yes
order: integers, where each person has their own and default to 1

the files to use (exhibits):
1 - pre-seed (user can select or de-select)
2 - user can upload (optional, they can upload or upload a replacement, then select or de-select)

On the modal there will be two primary actions:
- Cancel (secondary action)
- Compile (primary action)

Compile generates a compiled PDF from the current Word document (server converts DOCX → PDF) plus selected exhibits (PDFs). The client then shows a download link and may show a preview.


to reiterate the process:

the compile process does the following:

-take the DOCX file in the "View Latest" or most recent state (current default document)
-whatever exhibits the user will choose from the modal
-the modal will pre-seed a default exhibit
-users will be able to upload additional exhibits
-then we will compile whatever they have chosen
-I should be able to add max of 2 exhibits to be compiled
-I can remove any (including the default)

Validation errors must accompany informative error message with an actionable resolution, if possible.

maximize server-side work since it will simplify both clients

store the exhibits in an easy to find place, and don't hard-code them


Default document and Replace Default (clarification)

- Default document location: `default-document/current.docx` (single source of truth).
- View Latest: streams the in-memory current document if present (set by Replace Default or add-in), otherwise `default-document/current.docx`.
- Replace Default (user action): opens a file picker (DOCX only), then sends the file to the server to overwrite the default.
- Server behavior on replace:
  - Atomic write (write temp + rename) to `default-document/current.docx`.
  - No history retained in the prototype (old copies are removed so only one file exists).
  - Preserve the user's original filename in responses (used in Content-Disposition) while keeping the on-disk stable path.
- Compile primary: generally generated from the current default DOCX on the server (DOCX → PDF), then merged with selected exhibits. Fallback accepts a client-supplied base64 PDF.
- Ordering: primary first, then first exhibit, then second exhibit. New exhibits add at the bottom. Max 2 exhibits included.


Summarized specs (implementation guide)

- Storage
  - Default DOCX lives at `default-document/current.docx` (stable path).
  - Exhibits (PDFs) live under `exhibits/` and are served at `/exhibits`.

- Replace Default
  - Client: file picker (DOCX only), uploads base64 to server.
  - Server: atomic write to `default-document/current.docx` (temp + rename), no history retained. Reject empty/invalid DOCX. Save original filename in metadata for Content-Disposition.

- Compile API
  - Endpoint: `POST /api/compile`
  - Primary: `{ type: 'current' | 'pdfBase64', data? }`. When `'current'`, server converts current DOCX → PDF.
  - Exhibits: pass by ID using `exhibitsById: [{ id, include, order }]` or pass file paths during transition.
  - Server enforces: ≤ 2 included exhibits; primary first; sort by `order`.
  - Errors: `exhibit_not_found`, `exhibits_missing`, `too_many_exhibits`, `default_document_missing`, `no_inputs_selected`.

- Exhibits management
  - Endpoints:
    - `POST /api/upload-exhibit` (PDF only; enforces per-file max and per-user quotas)
    - `GET /api/exhibits/list` (returns defaults and user uploads)
    - `POST /api/exhibits/delete` (delete uploaded exhibit by ID)
    - `GET /api/exhibits/limits` (returns current limits)
  - Optional TTL cleanup to prevent accumulation in prototype.

- UX rules
  - If user tries to add a 3rd exhibit: show “Testing 1, 2...but no more in the prototype”.
  - Primary can be excluded, but at least one input must be included overall (primary or at least one exhibit).
  - Add-in currently omits the “Include primary” checkbox (primary included by default); web may allow excluding primary.

Technical prerequisites and lessons learned (MVP)

- Server-side DOCX → PDF requires LibreOffice (`soffice`).
  - Env: set `SOFFICE_BIN` to the soffice executable if not in PATH.
  - For local testing without LibreOffice, set `DOCX_PDF_STUB=1` to return a stub PDF.
- File validation
  - Reject invalid/empty DOCX on Replace Default.
  - Enforce exhibit quotas: per-file size and per-user file/bytes caps.
- Frontend
  - Use scoped CSS with high specificity/`!important` for modal buttons to avoid theme overrides.
  - YouTube autoplay in add-in requires muted autoplay and `allow=autoplay`.
  - Avoid `FileReader` string concatenation for large files; use `readAsDataURL`.
- Dev environment
  - Restart the API server when changing backend code to avoid stale processes.
  - Ensure files are UTF-8 without BOM to avoid minifier errors.

Open questions

- Can the Word add-in perform DOCX → PDF client-side reliably?
  - Options to explore: Office.js export capabilities, server round-trip of DOCX for conversion, or Graph/OneDrive conversions.
  - Constraints: browser autoplay/security policies, performance, and fidelity consistency versus server-side LibreOffice.