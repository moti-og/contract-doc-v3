param()
$required = @('server','server/src','clients','clients/addin','clients/web','clients/shared','data','data/app')
$missing = @()
foreach($p in $required){ if (!(Test-Path (Join-Path $p 'README.md'))) { $missing += $p } }
if ($missing.Count -gt 0) {
  Write-Error ("Missing README.md in: " + ($missing -join ', '))
  exit 1
} else { Write-Output 'READMEs OK' }
