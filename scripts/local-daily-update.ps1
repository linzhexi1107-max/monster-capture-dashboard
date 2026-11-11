$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$logDirectory = Join-Path $root 'logs'
$logFile = Join-Path $logDirectory 'daily-update.log'
$gcm = 'E:\软件\git\Git\mingw64\bin\git-credential-manager.exe'

New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
Set-Location -LiteralPath $root

"===== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') =====" | Out-File -LiteralPath $logFile -Append -Encoding utf8

try {
  & node (Join-Path $root 'scripts\refresh-static.mjs') *>> $logFile
  if ($LASTEXITCODE -ne 0) {
    throw "Database refresh failed with exit code $LASTEXITCODE."
  }

  $credentialInput = "protocol=https`nhost=github.com`nusername=linzhexi1107-max`n`n"
  $credentialLines = $credentialInput | & $gcm get 2>$null
  $tokenLine = $credentialLines | Where-Object { $_ -like 'password=*' } | Select-Object -First 1
  if (-not $tokenLine) {
    throw 'GitHub credential was not available.'
  }

  $env:GITHUB_TOKEN = $tokenLine.Substring(9)
  & node (Join-Path $root 'scripts\publish-github-data.mjs') *>> $logFile
  if ($LASTEXITCODE -ne 0) {
    throw "GitHub data publish failed with exit code $LASTEXITCODE."
  }

  'Daily dashboard update completed.' | Out-File -LiteralPath $logFile -Append -Encoding utf8
} catch {
  "Daily dashboard update failed: $($_.Exception.Message)" | Out-File -LiteralPath $logFile -Append -Encoding utf8
  throw
}
