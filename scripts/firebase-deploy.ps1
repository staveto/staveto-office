param(
  [switch]$SkipSecret,
  [switch]$RelaxedTls
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\enable-node.ps1"
Set-Location (Resolve-Path "$PSScriptRoot\..")

if ($RelaxedTls) {
  Write-Host "Relaxed TLS enabled for this deploy session only (corporate SSL / proxy workaround)." -ForegroundColor Yellow
  $env:NODE_TLS_REJECT_UNAUTHORIZED = "0"
}

try {
  & npm.cmd run functions:build
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  if (-not $SkipSecret) {
    Write-Host ""
    Write-Host "Setting GEMINI_API_KEY secret (skip if already in GCP: -SkipSecret)" -ForegroundColor Cyan
    & npm.cmd run firebase:secret
    if ($LASTEXITCODE -ne 0) {
      Write-Host ""
      Write-Host "Secret step failed (network/SSL?). Options:" -ForegroundColor Yellow
      Write-Host "  1) If GEMINI_API_KEY already exists: .\scripts\firebase-deploy.ps1 -SkipSecret"
      Write-Host "  2) Set secret in Google Cloud Console → Secret Manager, then -SkipSecret"
      Write-Host "  3) Retry with TLS workaround: .\scripts\firebase-deploy.ps1 -RelaxedTls"
      Write-Host "  4) Deploy functions only: npm run firebase:deploy"
      exit $LASTEXITCODE
    }
  } else {
    Write-Host "Skipping GEMINI_API_KEY prompt (-SkipSecret). Secret must already exist in GCP." -ForegroundColor Cyan
  }

  & npm.cmd run firebase:deploy
  exit $LASTEXITCODE
} finally {
  Remove-Item Env:NODE_TLS_REJECT_UNAUTHORIZED -ErrorAction SilentlyContinue
}
