param(
	[ValidateSet('up','down','logs')]
	[string]$Command = 'up'
)

$compose = Join-Path $PSScriptRoot '..' '..' 'docker-compose.yml'

switch ($Command) {
	'up'   { docker compose -f $compose up -d superdoc }
	'logs' { docker compose -f $compose logs -f superdoc }
	'down' { docker compose -f $compose down }
}


