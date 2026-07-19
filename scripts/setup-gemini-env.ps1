param(
  [string]$ApiKey,
  [string]$Model = "gemini-3.1-flash-lite"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $repoRoot "apps/api/.env"

if (-not $ApiKey) {
  $secure = Read-Host "Paste Gemini API key" -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    $ApiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

if (-not $ApiKey -or $ApiKey.Trim().Length -lt 20) {
  throw "Gemini API key looks missing or too short."
}

$existing = @{}
if (Test-Path $envPath) {
  foreach ($line in Get-Content -LiteralPath $envPath) {
    if ($line -match '^\s*([^#][^=]+?)\s*=\s*(.*)$') {
      $existing[$matches[1].Trim()] = $matches[2]
    }
  }
}

$existing["LLM_PROVIDER"] = "gemini"
$existing["LLM_MODEL"] = $Model
$existing["GEMINI_API_KEY"] = $ApiKey.Trim()

$orderedKeys = @(
  "NODE_ENV",
  "PORT",
  "MONGODB_URI",
  "MONGODB_DB",
  "AUTH_SECRET",
  "SEED_ON_START",
  "DEMO_CONTROLS_ENABLED",
  "EXTERNAL_SERVICE_TIMEOUT_MS",
  "LLM_PROVIDER",
  "LLM_MODEL",
  "GEMINI_API_KEY",
  "EMBEDDING_MODEL",
  "EMBEDDING_DIMENSIONS"
)

$lines = New-Object System.Collections.Generic.List[string]
foreach ($key in $orderedKeys) {
  if ($existing.ContainsKey($key)) {
    $lines.Add("$key=$($existing[$key])")
  }
}
foreach ($key in ($existing.Keys | Sort-Object)) {
  if ($orderedKeys -notcontains $key) {
    $lines.Add("$key=$($existing[$key])")
  }
}

Set-Content -LiteralPath $envPath -Value $lines -Encoding utf8
Write-Host "Gemini env written to apps/api/.env. Restart the API server, then open /system/readiness."
