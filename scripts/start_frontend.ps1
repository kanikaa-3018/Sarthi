Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$frontend = Join-Path $PSScriptRoot "..\frontend"
Push-Location $frontend
try {
  npm install
  npm run dev
}
finally {
  Pop-Location
}

