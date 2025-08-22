param()

$ErrorActionPreference = 'Stop'

function Ensure-Dir([string]$Path) {
  if (-not (Test-Path $Path)) { New-Item -ItemType Directory -Force -Path $Path | Out-Null }
}

$root = Split-Path -Parent $PSScriptRoot | Split-Path -Parent
$cfg = Join-Path $root 'server\config'
Ensure-Dir $cfg

$pfxPath = Join-Path $cfg 'dev-cert.pfx'
$cerPath = Join-Path $cfg 'dev-cert.cer'

if (Test-Path $pfxPath) {
  Write-Host "Dev PFX already exists: $pfxPath" -ForegroundColor Green
  exit 0
}

Write-Host "Generating and trusting localhost development certificate for backend (4001)..." -ForegroundColor Cyan

# Create self-signed cert for localhost in CurrentUser\My
$cert = New-SelfSignedCertificate -DnsName 'localhost' -CertStoreLocation 'Cert:\CurrentUser\My' -KeyExportPolicy Exportable -FriendlyName 'wordFTW Local Backend Dev'

# Export to PFX with the password used by server/src/server.js
$pwd = ConvertTo-SecureString -String 'password' -AsPlainText -Force
Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $pwd | Out-Null

# Export CER and trust it (import into CurrentUser\Root)
Export-Certificate -Cert $cert -FilePath $cerPath | Out-Null
Import-Certificate -FilePath $cerPath -CertStoreLocation 'Cert:\CurrentUser\Root' | Out-Null

Write-Host "Backend dev cert created and trusted:" -ForegroundColor Green
Write-Host "  PFX: $pfxPath"
Write-Host "  CER: $cerPath"

