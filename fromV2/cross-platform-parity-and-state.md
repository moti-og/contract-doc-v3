### Cross-platform parity and centralized state management

This doc captures the approach to keep the Web viewer and Word add-in functionally identical, by centralizing logic and minimizing divergence.

### Principles
- **Single source of truth (server)**: All permissioned UI decisions (buttons, approvals, banners) should flow from server state, not client heuristics.
- **Shared client logic**: One JS module applies server state to the UI across platforms; platform specifics are adapters only.
- **Canonical identifiers**: Use the same user and document IDs across platforms; avoid per-platform copies.
- **Event-driven updates**: Server pushes state deltas (SSE) to all clients; clients render from the latest state snapshot.
- **Deterministic UI**: The state matrix must fully determine visibility and enablement; no extra one-off toggles in views.

### What to centralize
- **State matrix evaluation**
  - Server: compute role + checkout + approvals matrix; expose via `/api/approval-matrix` and related endpoints.
  - Client: apply-only layer (e.g., `state-matrix-client.js`) maps matrix → UI elements.
- **Approvals logic**
  - Server: owns rules (who can approve whom, counts, summary); emits `approvals-updated` via SSE.
  - Client: renders pills and Approve/Reject buttons based solely on matrix.
- **User list and identities**
  - One canonical user list used by both platforms. Avoid Word-specific names or role drift.
- **UI control IDs and mapping**
  - Keep a common button ID map (`viewOnlyBtn`, `checkoutBtn`, etc.). Both platforms reference the same IDs/mapping so matrix → UI is identical.

### Platform adapters (keep minimal)
- **Word add-in specifics**
  - No blocking dialogs: replace `confirm()` with non-blocking notifications.
  - HTML/CSS sandbox sizing: adjust container widths but keep the same DOM IDs and structure for shared logic.
- **Web viewer specifics**
  - SuperDoc embedding/layout config can differ, but the state application layer remains the same.

### State management reminders
- **Single structured state**: Treat the state matrix as the one input for UI. Avoid parallel booleans in components.
- **Idempotent renders**: Re-applying the same state should not cause visual drift.
- **SSE resilience**: Auto-reconnect on drop, and fetch a fresh snapshot on reconnect.
- **Error-first flows**: When POSTs fail (e.g., approvals), surface errors and never assume client state changed.
- **Disable before hide**: Prefer disabling unavailable actions; hide only when irrelevant per matrix rules.
- **Debug trace**: Log matrix versions/timestamps when applying to help triage mismatches.

### Checklist for new features
1. Define server-side rule(s) and extend the matrix payloads.
2. Expose an endpoint or add fields to existing endpoints.
3. Update `state-matrix-client.js` mapping only (no per-view branching).
4. Ensure both platforms use the same IDs and loader for the shared client.
5. Add SSE event if feature requires real-time updates.
6. Add UI tests: role × checkout × approvals permutations render the same across platforms.

### Compile/Replace default notes
- Visibility for `compileBtn` and `replaceDefaultBtn` comes from the existing matrix.
- Enablement and guardrails (max exhibits, file types, atomic write) are enforced on the server during actions.
- See `docs/STATE-MATRIX-COMPILE.md` for the compile-specific matrix scope and validations.

### Anti-patterns to avoid
- Duplicating rules in both clients; truth must live server-side.
- Divergent DOM IDs leading to conditional client logic.
- Mutating UI locally without reconciling with server state.
- Embedding user-specific strings/logic in platform-specific files.

### Implementation notes in this codebase
- `state-matrix-client.js` is the shared apply layer controlling `viewOnlyBtn`, document dropdown visibility, and grouped actions.
- `/api/approval-matrix` provides: `users`, `matrix` (per-user action permissions), `approvals`, and `summary`.
- Viewers cannot checkout; `View Latest` is always present but may be disabled when no doc is loaded.
- Add-in replaces blocking confirms with notifications; otherwise shares the same approval rendering logic as the web.


