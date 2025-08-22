param()

$ErrorActionPreference = 'Stop'

# Compute repo root from this script's path: tools/scripts => repo
$repo = Split-Path -Parent $PSScriptRoot | Split-Path -Parent | Split-Path -Parent
$hooksDir = Join-Path $repo ".git/hooks"
New-Item -ItemType Directory -Force -Path $hooksDir | Out-Null

$postCheckout = @"#!/bin/sh
repo="$(git rev-parse --show-toplevel)"
powershell -NoProfile -ExecutionPolicy Bypass -File "$repo/tools/scripts/servers.ps1" -Action restart >/dev/null 2>&1 &
"@

Set-Content -Path (Join-Path $hooksDir 'post-checkout') -Value $postCheckout -NoNewline -Encoding UTF8

# Optional pre-merge-local hook to run local stress test before merges via CLI (non-blocking if hook missing in some tools)
$preMerge = @"#!/bin/sh
repo="$(git rev-parse --show-toplevel)"
powershell -NoProfile -ExecutionPolicy Bypass -File "$repo/tools/scripts/run-stress-local.ps1" -Iterations 20 -DelayMs 200 >/dev/null 2>&1 || exit 1
"@

Set-Content -Path (Join-Path $hooksDir 'pre-merge-commit') -Value $preMerge -NoNewline -Encoding UTF8

Write-Host "Installed Git hook: .git/hooks/post-checkout (auto-restarts servers on branch checkout)"
Write-Host "Installed Git hook: .git/hooks/pre-merge-commit (runs local stress test before merges)"

