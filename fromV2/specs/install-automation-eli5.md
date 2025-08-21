## Installation automation (ELI5) — Proposal

### Audience and goal
- Audience: non‑technical users (no CLI, no developer tools).
- Goal: a single guided experience that installs, configures, and launches the prototype (web viewer + Word add‑in) with minimal friction and friendly messaging.

> Important qualifier: this plan has been implemented and tested on Windows only so far. macOS steps are provided for parity and planning, but have not been fully tested.

### Supported platforms (v1 scope)
- Windows 10/11 (primary)
- macOS (secondary, where Office add‑in sideload policies allow)

### User journey (what the user sees)
1) Download a single installer (“OpenGov Contract Prototype Setup”).
2) Double‑click → wizard opens with a plain‑language welcome.
3) Click “Install” → a progress screen with 4 steps:
   - Check requirements
   - Install and configure components
   - Start services and open the app
   - Verify and finish
4) On success, browser opens `http://localhost:3001/viewer.html`, and Word opens with the add‑in taskpane attached (or a 1‑click “Open in Word” button).
5) A desktop shortcut “OpenGov Contract Prototype” is created. Uninstall entry appears in Control Panel (Windows) / Applications (macOS).

### Background flow (what we do for the user)
1) Requirements check
   - Detect Word (Office desktop) version and channel.
   - Check port 3001 availability; if busy, offer next available port (e.g., 3002) with user‑visible note.
   - Check Windows Firewall rules; plan to create inbound rule for chosen port on Localhost only.
   - macOS variant:
     - Detect Word via `/Applications/Microsoft Word.app` or `mdfind`.
     - No Windows Firewall equivalent; keep everything on `localhost`.
2) Install server runtime
   - Bundle the Node server as a single executable (e.g., pkg/esbuild/nexe) or ship Node runtime embedded.
   - Expand to `%ProgramFiles%\OpenGovContractPrototype` (Windows) or `/Applications/OpenGov Contract Prototype.app/Contents/Resources` (macOS) with a `data` directory for runtime JSON.
   - Startup mode (default per‑user, no admin):
     - Windows: create a Scheduled Task (On logon → current user) that launches the server with `--port` and `--data-dir`.
     - macOS: create a LaunchAgent plist in `~/Library/LaunchAgents`.
   - Advanced (optional elevation):
     - If the user opts in and elevation succeeds, install as a Windows service and create a localhost‑only firewall rule. If elevation is denied, fall back to the Scheduled Task and skip the firewall rule.
   - macOS variant details:
     - Install app bundle in `/Applications` (if user has permission) or `~/Applications`.
     - LaunchAgent file: `~/Library/LaunchAgents/com.opengov.contract.prototype.plist` (RunAtLoad=true, KeepAlive=false).
3) Configure runtime data
   - Seed runtime JSON into `%ProgramData%\OpenGovContractPrototype\data` (Windows) or `~/Library/Application Support/OpenGovContractPrototype/data` (macOS), so repo files aren’t mutated.
   - Set server `PORT` and `DATA_DIR` via a small `.env` next to the binary.
   - macOS variant:
     - Ensure parent folder exists; respect user sandbox paths.
4) Office add‑in wiring (with verification and fallback)
   - Manifest: generate/copy a manifest XML pointing to the local add‑in page (localhost URL preferred; file URL as fallback).
   - Windows registration (per‑user):
     - Add a Trusted Catalog in `HKCU\Software\Microsoft\Office\16.0\WEF\TrustedCatalogs` that points to the manifest folder, or write the manifest into the per‑user sideload folder.
     - Example manifest path: `%LOCALAPPDATA%\OpenGovContractPrototype\addin\manifest.xml`.
   - macOS registration: place the manifest in the Office add‑in sideload location (per Microsoft docs, typically `~/Library/Containers/com.microsoft.Word/Data/Documents/wef`) or use the dev tools sideload mechanism. If blocked by policy, surface manual steps.
   - Verify registration: after install, instruct user → Word → Insert → My Add‑ins → Shared. Expect to see “OpenGov Contract Prototype”. Provide a “Refresh catalogs” note.
   - Fallback “Open taskpane”: if registration fails, provide a one‑click button in the setup final screen that opens the taskpane page in Word (or clear instructions to load the local page), so the prototype remains usable.
5) Start and verify
   - Start the background runner (service or Scheduled Task) and poll health endpoints.
   - Health probes: `/api/health` (server liveness) and `/api/health/compile` if compile is enabled.
   - Open the web viewer in the default browser when healthy.
   - Optionally launch Word with an example document and auto‑open the taskpane (best‑effort); otherwise show a prominent “Open taskpane” button.
   - macOS variant:
     - Use `launchctl load -w ~/Library/LaunchAgents/com.opengov.contract.prototype.plist` and poll.
     - Open default browser (Safari/Chrome) with `open http://localhost:PORT/viewer.html`.

### Health checks and success criteria (stronger verification)
- Health probe sequence (with exponential backoff up to 30s total):
  1) GET `/api/health` → expect `{ ok: true }`
  2) GET `/api/current-document` → expect a JSON with `id` or a friendly “no document yet” message
  3) (Optional) GET `/api/health/compile` → expect `{ ok: true }` or a clear warning
- End‑to‑end check: load `viewer.html`, perform a quick fetch from the page (`fetch('/api/current-document')`). Surface a green “All set” banner if OK; otherwise show a yellow “Viewer reachable, but data missing” note with a retry button.
- Pass/fail: if any critical probe fails after retries, show a clear error with a “Try again” link and a “Troubleshoot” link.

### Installer steps and messages (Windows example)
Step 1 — Welcome
- Message: “This will install the OpenGov Contract Authoring prototype. You’ll get a local website and a Word add‑in. Nothing leaves your computer.”
 - Notification (log): `setup.welcome.shown`
 - Actions: [Install] [Cancel]

Step 2 — Requirements
- Check Word: “Found Microsoft Word (Office 16.0).”
- Check port: “Port 3001 is available.” (or) “Port 3001 is busy; we’ll use 3002 instead.”
- If Word missing: “We couldn’t find Microsoft Word. You can still use the web viewer; the add‑in requires Word.” [Continue] [Cancel]
 - Notifications:
   - `setup.requirements.ok`: includes detected Word, port, OS
   - `setup.requirements.word.missing`: severity=warning; recommend continue
   - `setup.requirements.port.busy`: includes chosen fallback port
 - Recommended actions:
   - Word missing → Proceed with web only, or install Word and re‑run.
   - Port busy → Accept suggested fallback; or choose a port manually.

Step 3 — Install location
- Default path with sufficient permissions; allow “Install for me only” if admin rights are unavailable.
 - Notification: `setup.installLocation.chosen` with path + scope (per‑user/system if elevated later)
 - Recommended actions:
   - Low disk space → choose another drive or free space.
   - Path invalid → select a different folder (must be user‑writable if not elevated).

Step 4 — Install components
- Progress with sub‑steps: “Copying files”, “Creating startup (Task/Service)”, “Configuring Office add‑in”, “Seeding data”.
- If elevation denied: “Couldn’t install service or firewall; using per‑user startup instead. You may see a Windows prompt on first launch.”
 - Notifications:
   - `setup.copy.ok` / `setup.copy.failed`
   - `setup.startup.task.ok` or `setup.startup.service.ok`
   - `setup.startup.service.failed`: include exact error code
   - `setup.firewall.ok` / `setup.firewall.skipped` / `setup.firewall.failed`
   - `setup.addin.config.ok` / `setup.addin.config.failed`
   - `setup.seed.ok` / `setup.seed.failed`
 - Recommended actions (each failure is actionable):
   - Service creation failed → [Continue with per‑user startup] [Retry with admin] [View details]
   - Firewall rule failed → [Skip rule (recommended on localhost)] [Retry with admin] [View details]
   - Add‑in config failed → [Show manual steps] [Copy instructions] [Try again]
   - Copy/seed failed → [Retry] [Choose another folder] [Open logs]

Step 5 — Launch
- “Starting server…” then “Opening web viewer…” and “Opening Word (optional)”.
- Finish page includes desktop shortcut option and a “Troubleshoot” link.
 - Notifications:
   - `setup.launch.server.starting` → then `setup.launch.server.healthy`
   - `setup.launch.viewer.opened`
   - `setup.launch.word.opened` (best‑effort)
 - Recommended actions:
   - Health failed → [Try again] [Open Troubleshoot] [Start server manually this session]
   - Viewer didn’t open → [Copy URL] [Open manually]
   - Word didn’t open → [Open Word] [Show add‑in verification]

### Error handling (examples, with friendly language and fixes)
- Port in use
  - Title: “That port is taken”
  - Body: “Something is already using port 3001. We can automatically use 3002.”
  - Actions: [Use 3002] [Choose another] [Email support]
  - Email support: open Troubleshoot and instruct “Copy text and send to msorkin@opengov.com”.
  - Fatal after retries: “We couldn’t reserve any port.” [Email support]

- Firewall block
  - Title: “Windows Firewall needs permission”
  - Body: “We’ll create a rule to allow local connections to the prototype on port 3001.”
  - Actions: [Allow] [Skip (launch may fail)] [Email support]
  - Email support: open Troubleshoot and instruct “Copy text and send to msorkin@opengov.com”.

- Word not found
  - “We couldn’t find Microsoft Word. You can proceed with the web viewer only. Later, install Word and re‑run the setup to add the taskpane.”
  - Actions: [Continue with web] [Email support]
  - Email support: open Troubleshoot and instruct “Copy text and send to msorkin@opengov.com”.

- Service start failure
  - “We couldn’t start the background service.”
  - Actions: [Try again] [Start for this session only] [Email support]
  - Email support: open Troubleshoot and instruct “Copy text and send to msorkin@opengov.com”.
  - Fatal after 2 retries: “Startup failed on this machine.” [Email support]

- Elevation denied (user declined or policy blocked)
  - “We couldn’t get admin privileges. We’ll continue with a per‑user startup that runs on logon. The prototype will still work, but we won’t add a firewall rule. You can re‑run Setup later and choose ‘Advanced’ to install the service.”
  - Actions: [Continue without admin (recommended)] [Retry as admin] [Email support]
  - Email support: open Troubleshoot and instruct “Copy text and send to msorkin@opengov.com”.

- Office add‑in registration failed
  - Message: “We couldn’t register the add‑in automatically. This can be blocked by policy.”
  - Actions: [Open Word & Refresh Add‑ins] [Skip for now] [Email support]
  - Simple manual step (Windows): “Open Word → Insert → My Add‑ins → Shared → Refresh.” (more than 2–3 steps becomes email support)
  - Email support: open Troubleshoot and instruct “Copy text and send to msorkin@opengov.com”.

- Health probe failure
  - “The server didn’t become healthy in time.”
  - Actions: [Try again] [Open Troubleshoot] [Email support]
  - Email support: open Troubleshoot and instruct “Copy text and send to msorkin@opengov.com”.
  - Fatal after retries: “Health checks failed.” [Email support]

#### macOS variants (errors)
- LaunchAgent creation failed
  - “We couldn’t create your startup agent.” Actions: [Try again] [Open Troubleshoot] [Email support]. Fatal after 2 retries.
- Add‑in registration blocked
  - “We couldn’t sideload the add‑in automatically.” Actions: [Open Word & Refresh Add‑ins] [Email support].

### What we do behind the scenes (command‑level, not user‑visible)
- Copy application files and runtime data to system locations.
- Write `.env` with `PORT`, `DATA_DIR`, and optional feature toggles.
- Register a user logon task (default) or Windows service (advanced) to run the server binary with `--port` and `--data-dir`.
- Add a Start Menu/desktop shortcut that opens the viewer URL.
- Write Office add‑in manifest to a known folder and update registry (HKCU) to include the manifest catalog path.
- Create/update Windows Firewall rule for inbound on localhost:PORT (TCP) only when running elevated.
- Rollback on failure: if service creation or firewall rule partially succeeds, remove any partial artifacts and fall back to the per‑user startup.

### Notifications catalog (for logs and UI toasts)
- Welcome
  - `setup.welcome.shown`
- Requirements
  - `setup.requirements.ok`
  - `setup.requirements.word.missing` (warn)
  - `setup.requirements.port.busy` (info)
- Install location
  - `setup.installLocation.chosen`
- Copy/Seed
  - `setup.copy.ok` / `setup.copy.failed`
  - `setup.seed.ok` / `setup.seed.failed`
- Startup (Task/Service)
  - `setup.startup.task.ok`
  - `setup.startup.service.ok`
  - `setup.startup.service.failed` (errorCode)
- Firewall
  - `setup.firewall.ok` / `setup.firewall.skipped` / `setup.firewall.failed`
- Add‑in
  - `setup.addin.config.ok` / `setup.addin.config.failed`
  - `setup.addin.verify.prompted`
- Launch/Health
  - `setup.launch.server.starting`
  - `setup.launch.server.healthy`
  - `setup.launch.viewer.opened`
  - `setup.launch.word.opened`
  - `setup.health.failed` (probe, details)
  - macOS‑specific
    - `setup.macos.launchAgent.ok`
    - `setup.macos.launchAgent.failed`

Each notification includes: timestamp, step, severity (info/warn/error), and `details` for support.
- Create logs in `%ProgramData%/OpenGovContractPrototype/logs` with rotation.

### Logging, diagnostics, and support
- Installer log in `%LOCALAPPDATA%/OpenGovContractPrototype/setup.log` (or macOS `~/Library/Logs/OpenGovContractPrototype/setup.log`).
- Server logs in `%ProgramData%/OpenGovContractPrototype/logs/server.log`.
- “Troubleshoot” page opens locally (HTML) with copy‑paste diagnostics (port check, service status, latest errors).
- Email support instructions (always shown on errors):
  - “Open the Troubleshoot page we just opened, copy the text, and paste into an email to msorkin@opengov.com with a short description.”
  - Raw log file paths are listed for power users who prefer to copy directly from files.
 - macOS paths recap: Setup log `~/Library/Logs/OpenGovContractPrototype/setup.log`; server logs under `~/Library/Application Support/OpenGovContractPrototype/logs` if not elevated.

### Uninstall and cleanup
- Uninstall removes the service, firewall rule, shortcuts, and app files.
- Ask whether to remove user data (runtime `data/`) or keep it.

### Distribution & update strategy (self‑contained installer)
- Distribution
  - Publish each version as a signed MSI/EXE on Releases with a clear “Download latest for Windows” link and checksums.
- Update flow (in‑place upgrade)
  - User downloads the new installer and runs it.
  - Installer detects existing install, stops Task/Service, replaces app binaries, preserves `.env` and runtime data, restarts runner.
  - Downgrades blocked by default; allow with explicit confirmation only.
  - Rollback on failure: restore previous binaries from `.backup` and restart prior version.
- App‑side prompt (optional)
  - Viewer polls a lightweight `latest.json`; if `/api/version` < latest, show “Update available” → opens Releases page.

### Security and permissions
- Code‑sign the installer and binaries.
- Prefer per‑user install when admin rights not available; otherwise elevate for service/firewall steps.
- Keep everything bound to localhost; no external network calls without consent.

### macOS notes
- Use a notarized `.pkg` that installs the app bundle and LaunchAgent.
- Office add‑ins registration differs; provide a simple copy‑paste path or one‑click script with appropriate permissions.
 - Add a one‑click “Reset LaunchAgent” in Troubleshoot (`launchctl unload/load`) with guidance to email logs if it fails.

### Acceptance criteria (E2E)
- Fresh machine → one installer → web viewer opens successfully.
- Word add‑in appears or is one click away with clear instructions.
- Restart machine → service starts; viewer reachable; add‑in works.
- Uninstall cleans up; optional to leave data.

### Deliverables (primary: self‑contained installer)
- Windows signed MSI/EXE (WiX/Inno Setup/Advanced Installer) that contains the full app (no Git/npm required):
  - Bundled server binary + assets
  - Service/Task and firewall creation
  - Office add‑in manifest registration
  - Logging and fallback scripts
- macOS notarized `.pkg` (optional v1)
- Troubleshoot HTML and support copy text

### Incremental backend‑first implementation & test plan

Focus: build and verify the installer + server in isolation from the app UI. Ship small, testable slices that are idempotent and observable.

Phased implementation
- Phase 0 — Server skeleton
  - Implement `/api/health`, `/api/health/compile` (stub), `/api/version`, `/api/selftest` endpoints
  - Config via `.env` (PORT, DATA_DIR, LOG_DIR, FEATURES)
  - Seed runtime data directory if missing; never overwrite if present
  - Add failure injection flags: `FEATURES=fail:compile, slow:health` for test

- Phase 1 — Minimal installer (per‑user only)
  - Copy server + assets to user folder; write `.env`
  - Create Scheduled Task (Windows) / LaunchAgent (macOS)
  - Start & probe `/api/health` until OK; open viewer URL (static placeholder OK)
  - Emit notifications defined in spec

- Phase 2 — Optional elevation
  - Add service + firewall path behind an “Advanced (requires admin)” option
  - Full rollback to per‑user on any error; log exact error codes

- Phase 3 — Office add‑in manifest (no app dependency)
  - Generate manifest pointing to a local placeholder taskpane page
  - Register per‑user catalog; verification step is purely navigational (“Open Word → My Add‑ins → Refresh”)
  - Fallback button “Open taskpane (local page)” works without registration

Backend‑first automated tests
- Unit tests (server)
  - Config parsing; port selection and fallback algorithm
  - Data seeding is idempotent; never overwrites existing data
  - Health endpoints return expected payloads; compile stub toggles between OK/unavailable

- Integration tests (installer logic, dry‑run where possible)
  - Windows: mock Scheduled Task creation (shell wrapper writes intent logs), verify log entries and env files
  - Elevation flow: simulate denied/accepted paths; verify rollback and notifications
  - Health probe backoff: simulate slow start, ensure retries then success
  - Add‑in registration: dry‑run registry writes to a sandbox hive or wrapper in test mode; verify verification prompt appears

- Golden log/notification tests
  - Run each error branch and assert emitted notification keys and severities match the catalog
  - Verify Troubleshoot page includes latest errors + paths

CI plan (no app coupling)
- Windows job: build server skeleton, run unit + integration tests, artifact a pilot installer (per‑user only)
- macOS job: run server unit tests; LaunchAgent dry‑run; produce pkg artifact (optional)
- Publish logs and a zipped Troubleshoot HTML as CI artifacts for examination

Interfaces & switches to keep decoupled from app code
- Serve a static `viewer.html` placeholder until the real app is ready; endpoints continue to pass health checks
- Feature flags control compile health, approvals mock data, and add‑in registration (enable/disable)
- All service/task/firewall/registry operations go through a thin wrapper with a `--dry-run` switch used in tests

Idempotency & update behavior (minimal now)
- Detect existing install by marker file (`INSTALL_INFO.json`) and running task/service
- If same version → offer Launch/Repair; Repair only re‑seeds missing assets, never data
- If newer version in installer → offer Update (in‑place): stop runner, replace binaries, keep `.env` and data, restart
- If older version in installer → block by default; allow advanced “Downgrade” with explicit confirmation

### Timeline (strawman)
- Week 1: Packaging POC, service + firewall automation
- Week 2: Office add‑in manifest wiring, runtime data location, troubleshoot page
- Week 3: Polishing, signing, and documentation


