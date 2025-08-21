# Simple smoke test for collab backend (Docker + TCP)
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/scripts/collab-smoke.ps1 -Port 4100

param(
	[int]$Port = 4002,
	[string]$Compose = "ops/docker/docker-compose.yml"
)

function Test-TcpPort {
	param([int]$Port)
	try {
		$client = New-Object System.Net.Sockets.TcpClient
		$iar = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
		$ok = $iar.AsyncWaitHandle.WaitOne(2000)
		if ($ok -and $client.Connected) { $client.Close(); return $true }
		$client.Close(); return $false
	} catch { return $false }
}

Write-Output "Collab smoke on port $Port"
$ok = $true

try {
	$ps = & docker compose -f $Compose ps --format json 2>$null | ConvertFrom-Json
	if ($ps | Where-Object { $_.Service -eq 'superdoc' -and $_.State -match 'running' }) {
		Write-Output 'PASS docker compose ps -> superdoc running'
	} else {
		Write-Output 'FAIL docker compose ps -> superdoc not running'
		$ok = $false
	}
} catch {
	Write-Output "WARN compose ps failed: $($_.Exception.Message)"
}

if (Test-TcpPort -Port $Port) {
	Write-Output "PASS TCP 127.0.0.1:$Port"
} else {
	Write-Output "FAIL TCP 127.0.0.1:$Port"
	$ok = $false
}

if ($ok) { Write-Output 'ALL PASS'; exit 0 } else { Write-Output 'FAILURES DETECTED'; exit 1 }


