# Installation Instructions (single page)

This is a simple, non-technical guide to get the prototype running locally.

## Get the files
- Option A (recommended): Download the ZIP from GitHub
  1) Open the repository page and click  Code  Download ZIP
  2) Rightclick the ZIP  Extract All to a folder you can find (for example, Desktop)
- Option B (for developers): git clone the repo and open the folder

You should see a file named:
- Click--Me--To--Install--The--Application--On--My--Computer--Please.bat

## Singleclick start
1) Doubleclick that .bat file
2) It will automatically:
   - Install a portable Node.js runtime if you dont already have one
   - Start the backend API and serve the web UI at http://localhost:3001
   - Register a local Trusted Catalog for the Word addin
   - Open the web viewer

## After it runs
- Web viewer: http://localhost:3001/viewer.html
- Word addin (onetime user action):
  1) Open Microsoft Word
  2) Go to Insert  My Addins  Shared Folder
  3) Select OpenGov Contracting
  4) If its not listed, click Refresh, or close and reopen Word once

## Common prompts
- SmartScreen / Unknown publisher: click More info  Run anyway (this is a local prototype)
- File blocked after download: rightclick the .bat  Properties  check Unblock  OK
- Admin prompt: not required; everything installs peruser

## Troubleshooting
- Quick health checks: http://localhost:3001/api/health and http://localhost:3001/api/version
- Full diagnostics: http://localhost:3001/api/troubleshoot (copy text if you need help)
- Smoke test (PowerShell):
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\smoke-test.ps1 -Port 3001
- Port busy: change the port in api-server.js (default 3001), then run again
- Word pane blank: close Word and reopen; then Insert  My Addins  Shared Folder  select OpenGov Contracting

## Notes
- No dev servers are required; the API serves the web UI from the same origin (CORSfree)
- The addin and web viewer share the same logic, so behavior matches across both
