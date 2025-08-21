param(
  [string]$CertName = "localhost-dev",
  [string]$CertPath = "../config",
  [int]$Years = 2
)

$ErrorActionPreference = 'Stop'
$fullPath = Resolve-Path -Path $CertPath
if (!(Test-Path $fullPath)) { New-Item -ItemType Directory -Path $fullPath | Out-Null }

Write-Host "Generating self-signed cert for https://localhost ..."
$cert = New-SelfSignedCertificate -DnsName "localhost" -CertStoreLocation "cert:\LocalMachine\My" -FriendlyName $CertName -NotAfter (Get-Date).AddYears($Years)

$pwd = ConvertTo-SecureString -String "password" -Force -AsPlainText
$pfxPath = Join-Path $fullPath "dev-cert.pfx"
$cerPath = Join-Path $fullPath "dev-cert.cer"
$keyPath = Join-Path $fullPath "dev-key.pem"
$crtPath = Join-Path $fullPath "dev-cert.pem"

Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $pwd | Out-Null
Export-Certificate -Cert $cert -FilePath $cerPath | Out-Null

Write-Host "Exporting PEM key/cert ..."
openssl pkcs12 -in $pfxPath -nodes -nocerts -password pass:password | openssl rsa -out $keyPath
openssl x509 -in $cerPath -out $crtPath

Write-Host "Trusting certificate ..."
Import-Certificate -FilePath $cerPath -CertStoreLocation "cert:\LocalMachine\Root" | Out-Null

Write-Host "Done. Set env variables or place files under server/config:"
Write-Host "SSL_KEY_PATH=$keyPath"
Write-Host "SSL_CERT_PATH=$crtPath"

