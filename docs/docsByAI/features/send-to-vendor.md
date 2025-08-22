# Feature: Send to Vendor (Spec)

## Summary
- **Purpose**: Allow an editor to quickly send a short message to a vendor from within the right‑pane UI.
- **Trigger**: Button “Send to Vendor” in the Actions grid opens a modal.
- **Availability**: Editors only (gated by state matrix / roles).

## State Matrix
- **Flag**: `buttons.sendVendorBtn`
- **Rule**: Enabled for `editor` role only; hidden for other roles.
- **Side‑effects**: None on document state; may emit a client parity event.

## UX Flow
1) User clicks “Send to Vendor”.
2) Modal opens (standard modal style):
   - Field 1 — From (text): pre‑populated with the current user’s label; editable
   - Field 2 — Message (textarea): optional; max 200 characters; live character counter
   - Field 3 — Vendor name (text): pre‑populated with `Moti's Builders`; editable
   - Primary button: “Send to Vendor” (enabled when validation passes)
   - Secondary: “Cancel”
3) On submit, show a confirmation modal: “You have just sent a link to this contract to {vendorName}.” with Close.

## Validation
- From: non‑empty
- Message: 1..200 chars (trimmed)
- Vendor name: non‑empty
- Disable submit until valid; show inline errors under each field as needed.

## API (prototype)
- `POST /api/v1/send-vendor`
  - Body: `{ from: string, message: string, vendorName: string, userId: string }`
  - Response: `{ ok: true }`
  - Notes: In prototype, endpoint may no‑op and log to server console or emit SSE `{ type: 'sendVendor', payload }`.

## Client Implementation Notes
- Right‑pane UI (`server/public/ui/components.js`):
  - Render “Send to Vendor” button when `config.buttons.sendVendorBtn` is true.
  - On click, open modal per modal style guide; on submit, call `POST /api/v1/send-vendor`.
  - After success, close form modal and open lightweight confirmation modal.
- Pre‑population sources:
  - From: selected user label from `/api/v1/users` list.
  - Vendor name: default constant `"Moti's Builders"`; editable.

## Style Guide (modal)
- Standard header “Send to Vendor”
- Body layout: stacked labels/inputs, 12px vertical spacing
- Footer: primary left, secondary right (or per house style)
- Respect theme tokens if present (future: `/api/v1/theme` → `theme.modal`)

## Telemetry (optional)
- Log client event via `/api/v1/events/client` with type `sendVendor` and payload `{ vendorName, len: message.length }`.

## Test Scenarios
- Editor sees the button; viewer/vendor do not.
- Empty message disables submit; 201‑char message shows error.
- Successful submission shows confirmation modal.
- SSE parity event received on web when triggered from add‑in (if implemented).
