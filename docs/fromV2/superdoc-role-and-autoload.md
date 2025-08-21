# Lessons Learned: SuperDoc Role Binding and Auto-Loading Documents

This note captures the key technical lessons from making SuperDoc honor user roles (viewer/suggester/editor) and reliably auto-load a default document at startup across the web viewer and Word add‑in.

## 1) Binding Role to Permissions (Suggesting/Review Mode)

What finally worked
- Configure mode/role strictly at initialization (do not toggle later):
  - documentMode: 'viewing' | 'suggesting' | 'editing'
  - role: 'viewer' | 'suggester' | 'editor'
- Map app roles → SuperDoc:
  - viewer → documentMode 'viewing', role 'viewer'
  - editor → documentMode 'editing', role 'editor'
  - suggester and vendor → documentMode 'suggesting', role 'suggester'
- Provide toolbar as a top‑level config (string selector): toolbar: '#superdoc-toolbar'
- Include the comments module (for UX), but rely on documentMode for suggestion behavior:
  - modules: { comments: { readOnly: documentMode === 'viewing', allowResolve: documentMode !== 'viewing' } }
- Recreate the SuperDoc instance on role switch (clear container, new init) instead of calling setDocumentMode after init.

Why
- Per docs, documentMode and role are primary levers at init time; post‑init toggling proved unreliable in our version.
- Top‑level toolbar selector matches the documented pattern and avoided internal assumptions from modules.toolbar.selector.

Version/build quirk we had to fix
- SuperDoc 0.14.19’s UMD build referenced a global __IS_DEBUG__ inside comment/track‑changes paths. Without it, suggesting failed noisily and edits behaved like normal edits.
- Fix: define the global before SuperDoc loads:
  <script>
    window.__IS_DEBUG__ = false;
  </script>
  After adding this, suggesting mode recorded tracked changes properly, and the toolbar indicated Suggesting.

What we stopped doing
- No setDocumentMode(...) after new SuperDoc(...) (we removed all post‑init mode enforcement).
- No custom DOM event blockers for suggesters (e.g., beforeinput preventDefault). With proper suggesting mode, SuperDoc handles track changes natively.

References
- SuperDoc Component (documentMode, role, toolbar, methods): https://docs.superdoc.dev/guide/components#superdoc
- Modules and toolbar patterns: https://docs.superdoc.dev/guide/modules#superdoc-toolbar

---

## 2) Auto‑Loading Default Document on Startup

Server responsibilities
- Serve a known default DOCX from default-document/CONTRACT FOR CONTRACTS.docx via /api/default-document.
- When hit, set currentDocument on the server to that file (id, filename, filePath, lastUpdated) for downstream routes to use.
- Serve the active document bytes from /api/document/:documentId with correct Content-Type.
- Expose exhibits/ statically (app.use('/exhibits', express.static(...))) for direct file inspection when needed.

Client responsibilities (web viewer)
- On window.load, call /api/default-document; if 200, pass returned object to a single loadSuperdoc(documentData) initializer.
- Construct SuperDoc with document: { id, type: 'docx', url: 'http://<api>/api/document/<id>' } (avoid direct file paths).
- Initialize mode/role per the user role mapping above.

Client responsibilities (Word add‑in)
- On Office.onReady, call /api/default-document and load it similarly (via web viewer flow or add‑in’s own import flow), ensuring the same default source of truth.

Why
- Keeping a single endpoint (/api/default-document) to establish currentDocument avoids racing different paths (uploads vs active doc endpoint), stabilizes SuperDoc loads, and aligns both platforms.

Operational note
- Replacing default-document/CONTRACT FOR CONTRACTS.docx on disk updates the default for the next init without code changes. Saves/check‑ins write timestamped copies; they do not overwrite the default unless explicitly asked.

---

## 3) Making “Send to Vendor” Invite‑Only (No Auto‑Lock)

- Server: /api/vendor/send no longer mutates checkout state; emits a neutral vendor-invited SSE only.
- Web client: success handler shows a standard notification + confirmation modal. It no longer calls state‑refresh functions (which previously cascaded into lock UI).
- SSE: vendor-invited adds a notification only; no fetchDocumentStatus() on that event.

Result: Sending to vendor does not lock the document. Editors can still check out as needed.

---

## 4) Toolbar & Initialization Gotchas

- Use the top‑level toolbar: '#superdoc-toolbar' to match docs; avoid passing toolbar only via modules.toolbar.selector.
- Never rely on post‑init mode changes to enforce permissions; reinitialize instead.
- Ensure the toolbar container exists before constructing SuperDoc.
- If the toolbar “disappears,” check for wrong config shape (e.g., passing an object where a selector string is expected).

---

## 5) Debugging Aids That Helped

- Log effective documentMode and role right after init: superdoc.config?.documentMode, .role.
- Add a one‑time status check a few seconds after init to confirm the editor mounted and the document served a valid DOCX.
- Minimal, targeted console logs beat heavy instrumentation; cache busters help when iterating on static assets.

---

## 6) Summary

- Suggesting worked consistently only when mode/role were set at init, toolbar was provided at the top level, and the UMD global __IS_DEBUG__ was defined.
- Auto‑loading stabilized by centralizing on /api/default-document and always feeding SuperDoc via /api/document/:id.
- Vendor flow was made invite‑only by removing server and client state mutations tied to “send.”

These patterns kept the system predictable across role switches, reloads, and cross‑platform usage.
