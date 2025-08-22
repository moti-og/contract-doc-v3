param(
  [int]$Iterations = 20,
  [int]$DelayMs = 250,
  [string[]]$Users = @('user1','user2','user3')
)

$ErrorActionPreference = 'Stop'

function Invoke-GetJson([string]$Path) {
  $base = 'https://localhost:4001'
  return Invoke-RestMethod -Method Get -Uri ("$base$Path") -UseBasicParsing
}

function Invoke-PostJson([string]$Path, $Body) {
  $base = 'https://localhost:4001'
  $json = $Body | ConvertTo-Json -Compress
  return Invoke-RestMethod -Method Post -Uri ("$base$Path") -ContentType 'application/json' -Body $json -UseBasicParsing
}

function Get-Matrix([string]$UserId) {
  $u = [System.Web.HttpUtility]::UrlEncode($UserId)
  return Invoke-GetJson "/api/v1/state-matrix?platform=web&userId=$u"
}

Write-Host "Sync stress starting... Iterations=$Iterations DelayMs=${DelayMs}ms Users=$($Users -join ',')"

$anomalies = @()

for ($i = 1; $i -le $Iterations; $i++) {
  Write-Host "\n--- Iteration $i ---" -ForegroundColor Cyan
  $a = $Users[0]
  $b = if ($Users.Length -gt 1) { $Users[1] } else { $Users[0] }

  try {
    # Checkout by A
    $r1 = Invoke-PostJson '/api/v1/checkout' @{ userId = $a }
    Start-Sleep -Milliseconds $DelayMs

    # Matrix checks
    $mA = Get-Matrix $a
    $mB = Get-Matrix $b
    $coA = $mA.config.checkoutStatus
    $coB = $mB.config.checkoutStatus
    if (-not $coA.isCheckedOut -or $coA.checkedOutUserId -ne $a) { $anomalies += "iter $i: A matrix mismatch after checkout (A=$($coA | ConvertTo-Json -Compress))" }
    if (-not $coB.isCheckedOut -or $coB.checkedOutUserId -ne $a) { $anomalies += "iter $i: B matrix mismatch after checkout (B=$($coB | ConvertTo-Json -Compress))" }

    # Checkin by A
    $r2 = Invoke-PostJson '/api/v1/checkin' @{ userId = $a }
    Start-Sleep -Milliseconds $DelayMs

    $mA2 = Get-Matrix $a
    if ($mA2.config.checkoutStatus.isCheckedOut) { $anomalies += "iter $i: still checked out after checkin" }

    # Finalize then unfinalize
    $rF = Invoke-PostJson '/api/v1/finalize' @{ userId = $a }
    Start-Sleep -Milliseconds $DelayMs
    $mF = Get-Matrix $a
    if (-not $mF.config.finalize.isFinal) { $anomalies += "iter $i: finalize not reflected" }
    $rU = Invoke-PostJson '/api/v1/unfinalize' @{ userId = $a }
    Start-Sleep -Milliseconds $DelayMs
    $mU = Get-Matrix $a
    if ($mU.config.finalize.isFinal) { $anomalies += "iter $i: unfinalize not reflected" }

    # Every 5 iters factory-reset
    if ($i % 5 -eq 0) {
      [void](Invoke-PostJson '/api/v1/factory-reset' @{})
      Start-Sleep -Milliseconds ($DelayMs * 2)
      $mR = Get-Matrix $a
      if ($mR.config.checkoutStatus.isCheckedOut) { $anomalies += "iter $i: reset did not clear checkout" }
    }
  }
  catch {
    $anomalies += "iter $i: exception $($_.Exception.Message)"
  }
}

Write-Host "\n--- Done ---"
if ($anomalies.Count -gt 0) {
  Write-Host ("Anomalies: {0}" -f $anomalies.Count) -ForegroundColor Yellow
  $anomalies | ForEach-Object { Write-Host " - $_" }
  exit 1
} else {
  Write-Host "No anomalies detected." -ForegroundColor Green
}

