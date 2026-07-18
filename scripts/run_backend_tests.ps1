Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$backend = Join-Path $PSScriptRoot "..\apps\api"
Push-Location $backend
try {
  npm run typecheck
  npm run build
}
finally {
  Pop-Location
}
