# Sync diagnostics recorder
# Usage examples:
#   powershell -NoProfile -File tools/scripts/sync-diagnostics.ps1
#   powershell -NoProfile -File tools/scripts/sync-diagnostics.ps1 -DurationSec 180 -IntervalSec 1 -Users user1,user2

[CmdletBinding()]
param(
  [int]$IntervalSec = 1,
  [int]$DurationSec = 120,
  [string[]]$Users = @('user1','user2'),
  [string]$Base = 'https://localhost:4001',
  [string]$OutFile
)

$ErrorActionPreference = 'Stop'

function Ensure-Dir($path) {
  $dir = Split-Path -Parent $path
  if (-not [string]::IsNullOrWhiteSpace($dir)) {
    if (-not (Test-Path -Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  }
}

function Get-Json($url) {
  try {
    return Invoke-RestMethod -Uri $url -Method Get -Headers @{ 'Cache-Control' = 'no-store' }
  } catch {
    return @{ error = $_.Exception.Message }
  }
}

function Head-Info($url) {
  try {
    $res = Invoke-WebRequest -Uri $url -Method Head -UseBasicParsing -Headers @{ 'Cache-Control' = 'no-store' }
    $len = $null
    if ($res.Headers.ContainsKey('Content-Length')) { $len = $res.Headers['Content-Length'] | Select-Object -First 1 }
    return @{ status = $res.StatusCode; length = $len }
  } catch {
    return @{ status = 0; error = $_.Exception.Message }
  }
}

if (-not $OutFile) {
  $stamp = (Get-Date).ToString('yyyyMMdd-HHmmss')
  $OutFile = Join-Path $PSScriptRoot "..\..\data\working\diagnostics\sync-$stamp.ndjson"
}
Ensure-Dir $OutFile

Write-Host "Recording sync diagnostics to $OutFile for $DurationSec seconds (interval $IntervalSec s) ..."

$end = (Get-Date).AddSeconds($DurationSec)
while ((Get-Date) -lt $end) {
  $ts = (Get-Date).ToString('o')

  # Server state snapshot using first user for matrix
  $matrix = Get-Json ("$Base/api/v1/state-matrix?platform=web&userId=" + [uri]::EscapeDataString($Users[0]))
  $rev = $matrix.revision
  $isFinal = $matrix.config.finalize.isFinal
  $coBy = $matrix.config.checkoutStatus.checkedOutUserId

  $userStates = @()
  foreach ($u in $Users) {
    $m = Get-Json ("$Base/api/v1/state-matrix?platform=web&userId=" + [uri]::EscapeDataString($u))
    $btn = $m.config.buttons
    $userStates += @{ userId = $u; checkoutBtn = [bool]$btn.checkoutBtn; checkinBtn = [bool]$btn.checkinBtn; saveProgressBtn = [bool]$btn.saveProgressBtn }
  }

  $w = Head-Info ("$Base/documents/working/default.docx?rev=$rev")
  $c = Head-Info ("$Base/documents/canonical/default.docx?rev=$rev")

  $entry = @{ ts = $ts; revision = $rev; isFinal = $isFinal; checkedOutBy = $coBy; users = $userStates; working = $w; canonical = $c }
  ($entry | ConvertTo-Json -Compress) | Out-File -FilePath $OutFile -Append -Encoding utf8

  Start-Sleep -Seconds $IntervalSec
}

Write-Host "Done. Diagnostics saved to $OutFile"


