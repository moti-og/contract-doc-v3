# Installation and Dev Setup (Prototype)

## Dependencies (required for developers)
- Windows 10/11 with admin rights
- Microsoft Word (desktop)
- Node.js 18+
- PowerShell 5.1+ (built-in) or PowerShell 7+
- Docker Desktop (with WSL2 enabled on Windows)
- Git (optional)
- Modern browser (Edge/Chrome) for the web client

## Why these dependencies
- Docker Desktop: runs the SuperDoc collaboration backend locally, giving full editor features (comments, tracked changes, import/export) and future multi-user parity.
- HTTPS dev cert: Word’s Edge WebView behaves most reliably over HTTPS; we serve both web and add‑in from the same origin.

## Dev ports and origins
- Unified app server (web + add‑in + API + static): `https://localhost:3001`
- SuperDoc backend (container): `https://localhost:4100`
- Same-origin hosting removes CORS/CSP friction and makes taskpane activation more reliable.

## Install notes (Windows)
- Node.js: download LTS from nodejs.org or use winget
  - `winget install -e --id OpenJS.NodeJS.LTS`
- Docker Desktop: requires admin, virtualization/WSL2; reboot may be needed
  - `winget install -e --id Docker.DockerDesktop --accept-source-agreements --accept-package-agreements`
  - Ensure WSL2 is enabled: `wsl --install`
- Git (optional): `winget install -e --id Git.Git`

## SuperDoc backend (local)
- Run the SuperDoc collaboration backend in a container on `https://localhost:4100`.
- Exact image name and environment variables come from the SuperDoc docs: https://docs.superdoc.dev/
- Ensure CORS allows `https://localhost:3001` and that TLS is enabled for local testing.

## HTTPS dev certificate (server)
- We use a trusted local certificate for `https://localhost:3001`.
- A PowerShell script will generate and trust a self‑signed certificate (to be added in `server/scripts/`).

## Next steps
- Start Docker Desktop
- Run the SuperDoc backend container on port 4100 per vendor instructions
- Start the Node server on port 3001 (HTTPS) to serve both clients and shared modules
- Open the web client and the Word add‑in (manifest points to the same origin)

Reference: SuperDoc Quick Start — https://docs.superdoc.dev/
