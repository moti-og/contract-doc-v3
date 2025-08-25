# React Cleanup Plan

Scope: tighten the web/add-in React integration, remove legacy paths, and align server flags with implemented UI.

## Task 1: Replace Default in React UI
- Current: API `/api/v1/document/upload` exists; React pane lacks button/flow.
- Problem: Users can’t replace `default.docx` from main UI.
- Fix: Add "Replace Default" button in `ActionButtons` (visible for owner checkout, not final). Use file picker; POST multipart to upload endpoint; on success, refresh state and update `documentSource`.
- Risk: Overwrites working copy; rely on server ownership checks.

## Task 2: Gate unused feature flags (compile/approvals)
- Current: Server advertises `compileBtn`, `approvalsBtn`.
- Problem: No UI or backend implementations.
- Fix: Hide buttons in UI and/or remove flags from server until backend exists. Optionally add disabled UI with tooltip.
- Risk: Confusing UX if shown without function.

## Task 3: Vendor path cleanup (`/static/vendor`)
- Current: Server serves alias `/static/vendor`; scripts/docs still reference it.
- Problem: Duplicate asset paths create drift.
- Fix: Update scripts/docs to `/vendor/...`; verify; remove express alias.
- Risk: Breaks tools referencing legacy path if missed.

## Task 4: Add-in demo code cleanup
- Current: `addin/src/taskpane/taskpane.js` contains Yeoman demo `run()`.
- Problem: Dead code; React is authoritative.
- Fix: Remove file or leave a minimal stub noting it’s unused.
- Risk: Low.

## Task 5: Collab WS scheme
- Current: `web/superdoc-init.js` hardcodes `wss://` for collab.
- Problem: HTTP-only dev (`ALLOW_HTTP=true`) will fail mixed content.
- Fix: Choose `ws` vs `wss` based on `location.protocol`.
- Risk: Collab down in HTTP dev until fixed.

## Task 6: View HTML cleanup
- Current: `#react-root` unused in `web/view.html`.
- Problem: Redundant DOM node.
- Fix: Remove or document purpose.
- Risk: Minimal.

## Task 7: Add-in tests for export/save-progress
- Current: Only web export is tested.
- Problem: No coverage for Word Office API path.
- Fix: Add tests with mocked Office.js for `exportWordDocumentAsBase64` flow.
- Risk: Testing gap remains until addressed.

## Task 8: Deprecate `/documents/default.docx`
- Current: Route exists; React prefers explicit working/canonical.
- Problem: Redundancy and ambiguity.
- Fix: Audit references; remove usages; deprecate then remove route.
- Risk: Unknown external consumers.

---
Execution order: 1, 2, 5, 3, 6, 4, 7, 8.

