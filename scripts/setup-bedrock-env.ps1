param(
  [string]$Profile = "agent-toolkit",
  [string]$Region = "ap-south-1"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $repoRoot "apps/api/.env"

$existing = @{}
if (Test-Path -LiteralPath $envPath) {
  foreach ($line in Get-Content -LiteralPath $envPath) {
    if ($line -match '^\s*([^#][^=]+?)\s*=\s*(.*)$') {
      $existing[$matches[1].Trim()] = $matches[2]
    }
  }
}

$existing["AI_PROVIDER_ORDER"] = "bedrock,gemini"
$existing["BEDROCK_ENABLED"] = "true"
$existing["AWS_REGION"] = $Region
$existing["AWS_DEFAULT_REGION"] = $Region
if ($Profile) {
  $existing["AWS_PROFILE"] = $Profile
}
$existing["BEDROCK_TEXT_MODELS"] = "apac.amazon.nova-micro-v1:0,apac.amazon.nova-lite-v1:0"
$existing["BEDROCK_VISION_MODELS"] = "apac.amazon.nova-lite-v1:0"
$existing["BEDROCK_EMBEDDING_MODEL"] = "amazon.titan-embed-text-v2:0"
$existing["BEDROCK_EMBEDDING_DIMENSIONS"] = "512"
$existing["BEDROCK_VECTOR_SEARCH_COLLECTION"] = "evidence_embeddings_bedrock"
$existing["BEDROCK_VECTOR_SEARCH_INDEX"] = "sarthi_evidence_vector_bedrock_512"

$orderedKeys = @(
  "NODE_ENV",
  "PORT",
  "MONGODB_URI",
  "MONGODB_DB",
  "AUTH_SECRET",
  "SEED_ON_START",
  "DEMO_CONTROLS_ENABLED",
  "EXTERNAL_SERVICE_TIMEOUT_MS",
  "AI_PROVIDER_ORDER",
  "BEDROCK_ENABLED",
  "AWS_REGION",
  "AWS_DEFAULT_REGION",
  "AWS_PROFILE",
  "BEDROCK_TEXT_MODELS",
  "BEDROCK_VISION_MODELS",
  "BEDROCK_EMBEDDING_MODEL",
  "BEDROCK_EMBEDDING_DIMENSIONS",
  "BEDROCK_VECTOR_SEARCH_COLLECTION",
  "BEDROCK_VECTOR_SEARCH_INDEX",
  "LLM_PROVIDER",
  "LLM_MODEL",
  "GEMINI_API_KEY",
  "VECTOR_SEARCH_ENABLED",
  "VECTOR_SEARCH_COLLECTION",
  "VECTOR_SEARCH_INDEX",
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
Write-Host "Bedrock-first AI config written to apps/api/.env for $Region. Existing Gemini settings were preserved as fallback."
