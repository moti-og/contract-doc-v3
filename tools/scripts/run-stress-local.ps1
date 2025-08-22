param(
  [int]$Iterations = 30,
  [int]$DelayMs = 200,
  [string[]]$Users = @('user1','user2')
)

$ErrorActionPreference = 'Stop'

function Stop-Servers {
  try { powershell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot/servers.ps1" -Action stop | Out-Null } catch {}
}

try {
  Write-Host "[stress-local] Restarting servers..." -ForegroundColor Cyan
  powershell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot/servers.ps1" -Action restart | Out-Null
  Start-Sleep -Seconds 4

  Write-Host "[stress-local] TLS gate..." -ForegroundColor Cyan
  $health = Invoke-RestMethod -Method Get -Uri 'https://localhost:4001/api/v1/health' -UseBasicParsing
  if (-not $health.ok) { throw "health endpoint not ok" }

  Write-Host "[stress-local] Running stress ($Iterations iters)..." -ForegroundColor Cyan
  powershell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot/sync-stress.ps1" -Iterations $Iterations -DelayMs $DelayMs -Users ($Users -join ',') | Out-String | Write-Host
  Write-Host "[stress-local] Completed" -ForegroundColor Green
  exit 0
}
catch {
  Write-Host "[stress-local] FAILED: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
finally {
  Write-Host "[stress-local] Stopping servers..." -ForegroundColor Yellow
  Stop-Servers
}


