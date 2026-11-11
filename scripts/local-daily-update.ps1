$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$logDirectory = Join-Path $root 'logs'
$logFile = Join-Path $logDirectory 'daily-update.log'
$tokenFile = Join-Path $root '.github-token.dpapi'

New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
Set-Location -LiteralPath $root

"===== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') =====" | Out-File -LiteralPath $logFile -Append -Encoding utf8

try {
  & node (Join-Path $root 'scripts\refresh-static.mjs') *>> $logFile
  if ($LASTEXITCODE -ne 0) {
    throw "Database refresh failed with exit code $LASTEXITCODE."
  }

  $encryptedToken = (Get-Content -LiteralPath $tokenFile -Raw).Trim()
  $secureToken = ConvertTo-SecureString $encryptedToken
  $tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
  try {
    $env:GITHUB_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
  }
  & node (Join-Path $root 'scripts\publish-github-data.mjs') *>> $logFile
  if ($LASTEXITCODE -ne 0) {
    throw "GitHub data publish failed with exit code $LASTEXITCODE."
  }

  'Daily dashboard update completed.' | Out-File -LiteralPath $logFile -Append -Encoding utf8
} catch {
  "Daily dashboard update failed: $($_.Exception.Message)" | Out-File -LiteralPath $logFile -Append -Encoding utf8
  throw
}
