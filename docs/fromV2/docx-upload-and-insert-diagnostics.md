## DOCX upload + in‑pane insert diagnostics (Word add‑in)

### Context
- Word add‑in “View Latest” failed with RichApi.Error: GeneralException when calling `insertFileFromBase64()`.
- Script Lab succeeded with a tiny DOCX. Our add‑in also succeeded inserting a specific local DOCX via a new Self Test.
- Server-fetched documents (both raw stream and base64 API) initially failed to insert.

### Root cause
- Not a host/API problem. Failures were document‑specific. The original server document was rejected by Word’s `insertFileFromBase64` pathway, while a re‑saved duplicate of the same content inserted successfully.
- Additional friction came from using the wrong upload format (multipart) for the server, which expects JSON with base64.

### What we changed (add‑in)
- Added “Self Test: Insert DOCX” to pick a local `.docx` and insert it in‑pane using the simplest working path.
- Added two server loaders beside “View Latest” for A/B testing:
  - “Load Latest (server/raw)”: stream bytes from `/api/document/:id[.docx]`, log headers/size/PK, convert to base64, try multiple insert modes.
  - “Load Latest (server/base64)”: call `/api/get-updated-docx` and insert the returned base64 using the same successful path as the self test.
- Added “Replace Current (upload)” to upload a known‑good local DOCX as the server’s current document. Important: the client now converts the file to base64 and POSTs JSON to `/api/upload-docx`.
- Updated “View Latest” to prefer base64 → raw → open‑as‑new fallbacks, and to avoid multiple `insertFileFromBase64` calls.

### What we changed (server)
- Endpoint contract reaffirmed: `POST /api/upload-docx` expects `{ docx: <base64>, filename: <string> }` in JSON, not multipart form data.
- Existing endpoints used by the add‑in:
  - `GET /api/get-updated-docx` → `{ docx: <base64>, filename }` for in‑pane insert.
  - `GET /api/document/:id` and `GET /api/document/:id.docx` for raw streaming and protocol handler.

### Diagnostics we added
- Client logs for content-type, content-length (raw fetch), byte counts, simple PK signature checks, and granular insert attempt traces (document.replace, body.start, selection.replace, open‑as‑new).
- Single‑call protection to prevent multiple overlapping `Word.run` batches.

### Key lessons learned
- “GeneralException” is often document‑specific. Re‑saving the document in Word (“Save As”) can normalize content and make it insertable.
- Prefer a base64 API for Word in‑pane inserts; use raw stream only as a fallback. Validate the first bytes (PK) quickly when diagnosing.
- Match server contracts precisely. For uploads, send JSON `{ docx: base64 }` rather than multipart, or you’ll get 400s.
- Avoid pre‑writes and multiple `insertFileFromBase64` calls. Guard with an in‑progress flag and keep the first insert minimal.
- Isolation mode is invaluable for narrowing variables (SSE/UI/auto‑attach off). Once a path works there, migrate that exact path to production flows.

### Current state
- In‑pane loading is stable using the updated “View Latest” (base64‑first) and the replace/upload tool to sanitize the server’s current document.
- Sync back to the web works through “Save Progress” (keeps checkout) and “Check In” (saves and unlocks). The web viewer updates via SSE or refresh.

### Next improvements
- Optional: add SHA‑256 comparisons between local self‑test bytes and server responses to quickly detect content drift.
- Optional: server‑side sanitizer (auto re‑save or validate DOCX on upload) to prevent problematic payloads entering the system.


