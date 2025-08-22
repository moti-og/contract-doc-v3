Office Add‑in Admin: Local Infra, Sideloading, HTTPS, and Reliability

This single doc captures what we learned about running the Word add‑in and web UI locally, making it reliable, and how to tear it down later.

Topology
- 4000: Add‑in dev server (webpack) – serves the taskpane and sideloads into Word
- 4001: Backend (Express) – API, SSE, static assets for web/add‑in
- 4002: Collab (Hocuspocus) – realtime backend used by SuperDoc
- Web UI: https://localhost:4001/view
- Shared UI module: GET /ui/components.js (top‑level shared-ui/)
- Vendor bundles (local): GET /vendor/superdoc/* (third‑party only)

Sideloading vs Store
- Sideload (dev): addin/npm start opens Word with the add‑in from the local dev server (4000). Browser and Word must trust your backend (4001) to avoid fetch failures.
- Microsoft Partner Center (prod): users install from Microsoft’s trusted origin; local 4000 goes away. Backend must still use a real CA cert in production.

HTTPS Strategy (Reliable Now, Easy to Remove Later)
Order of preference at server startup (4001):
1) Office dev cert (shared with 4000) via office-addin-dev-certs – browser already trusts this
2) Local PFX fallback server/config/dev-cert.pfx (CN=localhost)
3) HTTP only if ALLOW_HTTP=true (dev escape hatch)

Why: keeps browser trust consistent across ports without manual steps. We added:
- tools/scripts/dev-cert-backend.ps1 – one‑click create/trust PFX at server/config/dev-cert.pfx
- Start script passes SSL_PFX_PATH/SSL_PFX_PASS when PFX exists
- Backend prefers Office cert first; clear logs on which path is active

Common reasons trust breaks (web only, not add‑in):
- Using 127.0.0.1 or hostname instead of https://localhost:4001
- Browser kept old trust state; fully quit and reopen
- HSTS/cert decisions pinned incorrectly (clear via chrome://net-internals/#hsts)

One‑Click Server Management
- Start/Stop/Status: tools/scripts/*.bat or servers.ps1 -Action start|stop|status
- Sideload add‑in is integrated in start; also available via servers.ps1 -Action sideload
- Post‑checkout hook (optional): tools/scripts/install-git-hooks.ps1 auto‑restarts servers after git checkout to keep code+servers aligned

Sync Hardening
- Server revision counter attached to API/SSE
- Client auto‑resync on SSE open/revision change; manual “Resync” button
- JSON endpoints set Cache-Control: no-store

Incremental Testing (Strict TLS by default)
- Stress test: tools/scripts/sync-stress.ps1
  - Stage 1: TLS gate (/api/v1/health) – fails fast if cert/trust is broken
  - Stage 2: action loop (checkout/checkin/finalize/reset) with state assertions
  - -SkipTls flag: functional testing only (uses curl -sk), prints notice

Failure Modes and Fixes
- net::ERR_CERT_AUTHORITY_INVALID (web only): trust path for 4001 – prefer Office cert; fallback PFX; browser restart; HSTS clear
- 409 on Cancel Checkout: expected if you’re not the current checkout owner
- “cannot GET …”: wrong URL (/api/v1/...) or wrong port (4001, not 40001)
- “Failed to fetch” right after branch switch: running servers from an old branch; use the post‑checkout hook or manually restart

Fast Checklist
1) tools/scripts/servers.ps1 -Action start (adds sideload)
2) If trust errors: tools/scripts/dev-cert-backend.ps1 → restart → fully restart browser
3) Web at https://localhost:4001/view; add‑in via Word
4) Optional: tools/scripts/sync-stress.ps1

Cleanup Plan (for production)
- Remove: dev cert scripts, PFX fallback, HTTP opt‑in, post‑checkout hook
- Keep: clear /ui, /vendor, /view routes; migrate to prod CA cert on backend domain

