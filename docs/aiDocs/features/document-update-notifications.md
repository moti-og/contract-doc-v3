# Feature: Document Update Notifications (Web → Word add‑in and vice versa)

## Summary
- **Purpose**: Notify users when a newer version of the document exists without auto‑replacing their current view. Provide a lightweight banner with an explicit action to update.
- **Scope**: Cross‑client parity. If Warren updates on the Web, users in the Word add‑in see a non‑blocking banner to refresh; likewise, Web shows a banner when Word commits changes.
- **Non‑goals**: No real‑time diff/merge, no auto‑update of the editor surface, no per‑section merge conflicts.

## Triggers
- Any server‑accepted write that changes the canonical/working document increments the server `documentVersion` and updates `lastUpdated` and `updatedBy`.
- Typical sources:
  - Check‑in from Word add‑in that persists content
  - Server‑side finalize/unfinalize that rewrites the canonical
  - Web edits that commit/replace the working document

## State Matrix Additions
- New fields in the computed matrix returned by `GET /api/v1/state-matrix?platform&userId`:
  - `documentVersion: number` (monotonic; starts at 1)
  - `lastUpdated: number` (epoch ms)
  - `updatedBy: { userId: string, label: string } | null`
  - `updateBanner: string | null` (server‑composed, localized‑ready text, e.g., "Warren updated this document 2 minutes ago.")
  - `buttons.refreshLatestBtn: boolean` (true when `documentVersion > client.loadedVersion`)
- Clients compare `documentVersion` from the state matrix against their `loadedVersion` (tracked locally when a doc is mounted/replaced). If `server > client`, set `updateAvailable = true` and render the banner and button.

## Events (SSE)
- Stream: `GET /api/v1/events`
- On any document write:
  - `event: state:update` with payload containing at least `{ documentVersion, lastUpdated, updatedBy, ... }`
  - Optional lightweight event: `event: document:changed` with `{ documentVersion }` to let clients fast‑path banner logic.
- Coalescing: the server debounces broadcast within a 2s window to prevent banner thrash during batch operations.

## UX — Word add‑in
1) When `updateAvailable` becomes true, show a non‑modal banner at the top of the right‑pane:
   - Text: content of `updateBanner`
   - Primary: “Refresh document”
   - Secondary: “Dismiss”
2) Clicking “Refresh document” fetches the latest (see Refresh behavior) and replaces the current document body via Office.js.
3) “Dismiss” hides the banner for the current `documentVersion`. If a newer version arrives later, the banner reappears.
4) If the user currently has a checkout and is editing, the banner still shows; the action confirms: “Refreshing will replace the content in Word. Continue?”

## UX — Web
- Same banner pattern in the shared UI region used by other feature banners.
- Primary: “Refresh” remounts the editor surface with the latest doc.
- Secondary: “Dismiss” persists until a newer `documentVersion` arrives or page reloads.

## Refresh behavior
- Word add‑in:
  - Download DOCX (canonical or working as appropriate), convert to Base64, then replace via:
    - `Word.run(ctx => ctx.document.body.insertFileFromBase64(base64, Word.InsertLocation.replace))`
  - Update `client.loadedVersion = server.documentVersion` after success.
- Web:
  - Dispatch `superdoc:open-url` with the resolved latest URL (canonical/working) to remount SuperDoc.
  - Update `client.loadedVersion` in memory to the server version.

## Endpoints
- Read:
  - `GET /api/v1/state-matrix` → now includes `documentVersion`, `lastUpdated`, `updatedBy`, and `buttons.refreshLatestBtn`.
  - `GET /documents/default.docx` (overlay resolver) and/or explicit canonical/working endpoints used on refresh.
- Events:
  - `GET /api/v1/events` for `state:update` (and optional `document:changed`).

## Client Implementation Notes
- Shared UI (`/ui/components.react.js`):
  - Maintain `client.loadedVersion` per mount. Initialize from first `state-matrix` response or a server hint on document download headers (e.g., `x-doc-version`).
  - On `state:update`, compare versions and toggle `updateAvailable` state; render a standard banner component.
  - Render “Refresh” button when `config.buttons.refreshLatestBtn` is true.
- Web host (`server/public/view.html`):
  - Listen for a custom event (e.g., `superdoc:refresh-latest`) from the shared UI to remount the editor with the latest URL.
- Word add‑in (taskpane):
  - Wire the “Refresh document” CTA to the Office.js replace flow. Show a lightweight confirm if editing.

## Banner style and theming
- Uses theme tokens exposed by `/api/v1/theme` (no hardcoded colors). Suggested tokens:
  - `theme.banner.bg`, `theme.banner.fg`, `theme.banner.border`
  - `theme.banner.primary.bg`, `theme.banner.primary.fg`
  - `theme.banner.secondary.bg`, `theme.banner.secondary.fg`

## Edge cases
- User has unsaved edits (add‑in): show confirm before replace. If they cancel, keep banner visible.
- Frequent updates: debounced SSE ensures a single banner per version. Clients collapse repeats where `documentVersion` unchanged.
- Checkout interactions: banner still shows to non‑owners; refresh fetches latest read‑only view. Owners who refresh stay owners; no checkout mutation occurs.
- Finalized documents: refresh still loads latest canonical; banner text can reflect “finalized by {user}”.
- Offline / SSE drop: on reconnect, the first `state-matrix` diff triggers the banner if behind.

## Telemetry (optional)
- Log UI events: `updateBanner.shown`, `updateBanner.refresh`, `updateBanner.dismiss` with `{ fromVersion, toVersion, platform }` via `/api/v1/events/client`.

## Testing
- Manual:
  1) Open Web as Warren and Word add‑in as another user.
  2) Make a change on Web that persists; verify add‑in shows the banner with Warren’s label.
  3) Click “Dismiss”; verify no banner reappears until a new version is created.
  4) Click “Refresh document”; verify content replaces and banner clears.
- Automated:
  - Unit test: version comparison logic and banner visibility toggling.
  - API test: server increments `documentVersion` and includes it in `state-matrix` and SSE payload.

## Files of record
- UI (React right‑pane): `/ui/components.react.js` (banner render + refresh CTA)
- Web host: `server/public/view.html` (remount on refresh)
- Server: `server/src/server.js` (versioning, SSE emit, state matrix fields)

## Notes
- This feature aligns with “view, then choose to update” safety: users never lose context due to silent refreshes. Banner text originates from the server for consistency and localization.


