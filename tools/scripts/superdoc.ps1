param(
    [ValidateSet('up','down','logs')]
    [string]$Command = 'up'
)

# Resolve compose file (moved under ops/docker)
$compose = Join-Path -Path $PSScriptRoot -ChildPath '..\..\ops\docker\docker-compose.yml'
try { $compose = (Resolve-Path -LiteralPath $compose).Path } catch {
    Write-Error "docker-compose.yml not found at $compose"; exit 1
}

# Ensure Docker CLI exists
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error 'Docker CLI not found. Install Docker Desktop and reopen PowerShell.'; exit 1
}

function Invoke-Compose {
    param([string[]]$Args)
    # Prefer Compose v2
    cmd /c "docker compose version" 1>$null 2>$null
    if ($LASTEXITCODE -eq 0) { & docker compose @Args; return }
    if (Get-Command docker-compose -ErrorAction SilentlyContinue) { & docker-compose @Args; return }
    throw 'Docker Compose not found (docker compose or docker-compose)'
}

switch ($Command) {
    'up'   { Invoke-Compose @('-f', $compose, 'up', '-d', 'superdoc') }
    'logs' { Invoke-Compose @('-f', $compose, 'logs', '-f', 'superdoc') }
    'down' { Invoke-Compose @('-f', $compose, 'down') }
}


