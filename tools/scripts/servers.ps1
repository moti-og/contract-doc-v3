param(
  [ValidateSet('start','stop','restart','status','sideload')]
  [string]$Action = 'status'
)

$ErrorActionPreference = 'SilentlyContinue'

function Get-PortPid([int]$Port) {
  (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess)
}

function Stop-Port([int]$Port) {
  $p = Get-PortPid -Port $Port
  if ($p) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue; Write-Host "Stopped port $Port (PID $p)" }
  else { Write-Host "No listener on port $Port" }
}

function Start-Backend() {
  $root = Split-Path -Parent $PSCommandPath | Split-Path -Parent | Split-Path -Parent
  Start-Process -FilePath "powershell" -ArgumentList "-NoProfile","-ExecutionPolicy","Bypass","-Command","$env:SUPERDOC_BASE_URL='http://localhost:4002'; cd '$root'; node server/src/server.js" -WindowStyle Minimized -PassThru
}

function Start-Dev() {
  $root = Split-Path -Parent $PSCommandPath | Split-Path -Parent | Split-Path -Parent
  Start-Process -FilePath "powershell" -ArgumentList "-NoProfile","-ExecutionPolicy","Bypass","-Command","cd '$root\\addin'; npm run dev-server" -WindowStyle Minimized -PassThru
}

function Start-Collab() {
  $root = Split-Path -Parent $PSCommandPath | Split-Path -Parent | Split-Path -Parent
  Start-Process -FilePath "powershell" -ArgumentList "-NoProfile","-ExecutionPolicy","Bypass","-Command","cd '$root'; node collab/server.js" -WindowStyle Minimized -PassThru
}

function Start-AddinSideload() {
  $root = Split-Path -Parent $PSCommandPath | Split-Path -Parent | Split-Path -Parent
  # Launch Office sideload (opens Word and loads the add-in)
  Start-Process -FilePath "powershell" -ArgumentList "-NoProfile","-ExecutionPolicy","Bypass","-Command","cd '$root\\addin'; npm start" -WindowStyle Normal -PassThru
}

function Show-Status() {
  $conns = Get-NetTCPConnection -LocalPort 4000,4001,4002 -State Listen -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,OwningProcess,State
  if ($conns) { $conns | Format-Table -AutoSize | Out-Host } else { Write-Host "No listeners on 4000/4001" }
}

switch ($Action) {
  'status'   { Show-Status }
  'stop'     {
    Stop-Port 4000; Stop-Port 4001; Stop-Port 4002;
    try {
      $root = Split-Path -Parent $PSCommandPath | Split-Path -Parent | Split-Path -Parent
      Start-Process -FilePath "powershell" -ArgumentList "-NoProfile","-ExecutionPolicy","Bypass","-Command","cd '$root\\addin'; npm run stop" -WindowStyle Minimized | Out-Null
    } catch {}
    Show-Status
  }
  'start'    {
    Stop-Port 4000; Stop-Port 4001; Stop-Port 4002;
    $c=Start-Collab; Start-Sleep -Seconds 1;
    $b=Start-Backend; Start-Sleep -Seconds 1;
    $d=Start-Dev; Start-Sleep -Seconds 1;
    $a=Start-AddinSideload; Start-Sleep -Seconds 1;
    Write-Host "Collab PID: $($c.Id)  Backend PID: $($b.Id)  Dev PID: $($d.Id)  Addin PID: $($a.Id)";
    Show-Status
  }
  'restart'  {
    Stop-Port 4000; Stop-Port 4001; Stop-Port 4002;
    $c=Start-Collab; Start-Sleep -Seconds 1;
    $b=Start-Backend; Start-Sleep -Seconds 1;
    $d=Start-Dev; Start-Sleep -Seconds 1;
    $a=Start-AddinSideload; Start-Sleep -Seconds 1;
    Write-Host "Collab PID: $($c.Id)  Backend PID: $($b.Id)  Dev PID: $($d.Id)  Addin PID: $($a.Id)";
    Show-Status
  }
  'sideload' { Start-AddinSideload }
}


