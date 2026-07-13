Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$backend = Join-Path $PSScriptRoot "..\backend"
Push-Location $backend
try {
  python -m pytest
}
finally {
  Pop-Location
}

