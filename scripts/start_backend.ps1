Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$backend = Join-Path $PSScriptRoot "..\apps\api"
Push-Location $backend
try {
  npm install
  npm run seed
  npm run dev
}
finally {
  Pop-Location
}
