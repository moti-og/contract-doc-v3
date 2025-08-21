## Docker notes (local collaboration backend)

### Purpose
These notes document how we use Docker locally for the collaboration backend (Hocuspocus/Yjs) and how our Compose file is organized.

### Compose file location
- We moved the Compose file to `ops/docker/docker-compose.yml` to keep infra config under an ops/ area.
- Compose files can live anywhere; when not at the repo root, use `-f <path>` (our helper script already does this).
- Relative paths in a Compose file are resolved from the directory containing that file.

### Key paths
- Compose: `ops/docker/docker-compose.yml`
- Collab build context: `collab/`
- Service name: `superdoc`
- Port mapping: `4002:4100` (HTTP and WebSocket at `http://localhost:4002` / `ws://localhost:4002`)
- App server default `SUPERDOC_BASE_URL`: `http://localhost:4002`

### Start sequence (after reboot)
```powershell
& "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe"
docker --version
docker compose version

Set-Location "C:\\Users\\msokrin\\OneDrive - OpenGov, Inc\\Useful files\\wordFTW"
.\\tools\\scripts\\superdoc.ps1 -Command up
.\\tools\\scripts\\superdoc.ps1 -Command logs

.\\tools\\scripts\\superdoc.ps1 -Command down
```

### Direct Compose commands (optional)
```powershell
docker compose -f .\\ops\\docker\\docker-compose.yml up -d superdoc
docker compose -f .\\ops\\docker\\docker-compose.yml logs -f superdoc
docker compose -f .\\ops\\docker\\docker-compose.yml ps
docker compose -f .\\ops\\docker\\docker-compose.yml down
```

### Adding volumes or services
- Volumes should be specified relative to `ops/docker/`, e.g. `../../data/working/superdoc:/data`.
- If you add more services later, keep them in this Compose file or create additional files (e.g., `compose.dev.yml`) and pass multiple `-f` flags.

### FAQs
- Can the Compose file live under `server/`? Yes. We already use `server/docker/docker-compose.yml` and the helper script points to it.
- Is Compose a special config type? No. It’s a standard Docker Compose YAML; location is flexible.
- Why not keep it at repo root? We prefer grouping server-related infra under `server/` for clarity.

### Troubleshooting
- Docker CLI not found:
  - Start Docker Desktop, reopen PowerShell.
  - Check: `docker --version`, `docker compose version`.
- WSL 2 not available (if prompted):
  - `wsl --status` then `wsl --install` if needed.
- Compose “version is obsolete” warning:
  - Remove the top-level `version:` key; Compose v2 ignores it by design.
- Port already in use:
  - Stop anything on 4002 or change the host port in Compose.
- Script path issues:
  - Always run from the repo root so `tools/scripts/superdoc.ps1` can locate the Compose file.

### Notes for future CI/CD
- If we add CI, keep a `compose.ci.yml` alongside `docker-compose.yml` and combine with `-f` flags.
- Avoid publishing the local collab image; it’s only for dev.


