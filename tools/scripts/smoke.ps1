# Simple smoke test for unified server
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/scripts/smoke.ps1 -Origin http://localhost:4001

param(
	[string]$Origin = $env:ORIGIN
)

if (-not $Origin -or $Origin.Trim() -eq '') { $Origin = 'http://localhost:4001' }

Write-Output "Smoke against $Origin"

function Test-Get {
	param(
		[string]$Url,
		[string]$Name
	)
	try {
		$resp = Invoke-WebRequest -UseBasicParsing -Uri $Url -Method Get -TimeoutSec 8
		$code = [int]$resp.StatusCode
		if ($code -ge 200 -and $code -lt 400) {
			Write-Output ("PASS {0} -> {1}" -f $Name, $code)
			return $true
		} else {
			Write-Output ("FAIL {0} -> {1}" -f $Name, $code)
			return $false
		}
	} catch {
		Write-Output ("FAIL {0} -> {1}" -f $Name, $_.Exception.Message)
		return $false
	}
}

$ok = $true
$ok = (Test-Get ("{0}/api/v1/health" -f $Origin) "health") -and $ok
$ok = (Test-Get ("{0}/static/vendor/superdoc/superdoc.umd.min.js" -f $Origin) "superdoc-js") -and $ok
$ok = (Test-Get ("{0}/static/vendor/superdoc/style.css" -f $Origin) "superdoc-css") -and $ok
$ok = (Test-Get ("{0}/documents/default.docx" -f $Origin) "default-doc") -and $ok
$ok = (Test-Get ("{0}/view" -f $Origin) "view-html") -and $ok
$ok = (Test-Get ("{0}/debug" -f $Origin) "debug-html") -and $ok

if ($ok) {
	Write-Output 'ALL PASS'
	exit 0
} else {
	Write-Output 'FAILURES DETECTED'
	exit 1
}


