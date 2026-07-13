Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Push-Location (Join-Path $PSScriptRoot "..")
try {
  docker compose up -d neo4j
  Write-Host "Neo4j browser: http://localhost:7474"
  Write-Host "Bolt URI: bolt://localhost:7687"
}
finally {
  Pop-Location
}

