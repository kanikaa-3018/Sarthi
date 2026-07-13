Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$backend = Join-Path $PSScriptRoot "..\backend"
Push-Location $backend
try {
  if (-not (Test-Path ".venv")) {
    python -m venv .venv
  }
  .\.venv\Scripts\python -m pip install -r requirements.txt
  .\.venv\Scripts\python -m app.seed
  .\.venv\Scripts\python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
}
finally {
  Pop-Location
}

