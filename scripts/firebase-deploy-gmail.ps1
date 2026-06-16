# Deploy Gmail Cloud Functions (OAuth). Uses TLS workaround for Windows schannel issues.

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\enable-node.ps1"
$root = Resolve-Path "$PSScriptRoot\.."
Set-Location $root

Write-Host ""
Write-Host "Deploying Gmail functions with TLS verification relaxed for this session only." -ForegroundColor Yellow
Write-Host ""

$localSecret = $null
$envPath = Join-Path $root ".env.local"
if (Test-Path $envPath) {
  foreach ($line in Get-Content $envPath) {
    if ($line -match '^\s*GMAIL_CLIENT_SECRET=(.+)\s*$') {
      $localSecret = $matches[1].Trim().Trim('"').Trim("'")
      break
    }
  }
}

$env:NODE_TLS_REJECT_UNAUTHORIZED = "0"
try {
  if ($localSecret) {
    Write-Host "Uploading GMAIL_CLIENT_SECRET from .env.local..." -ForegroundColor DarkGray
    $localSecret | firebase functions:secrets:set GMAIL_CLIENT_SECRET --data-file - --force
    if ($LASTEXITCODE -ne 0) {
      Write-Host "Failed to set Firebase secret. Check firebase login." -ForegroundColor Red
      exit 1
    }
  } else {
    Write-Host "No GMAIL_CLIENT_SECRET in .env.local - run npm run setup:gmail first." -ForegroundColor Red
    exit 1
  }

  npm run build --prefix functions
  & firebase deploy --only "functions:gmailOAuthCallback,functions:gmailBuildAuthUrl" --force
  if ($LASTEXITCODE -eq 0) {
    Write-Host "Setting public invoker via gcloud..." -ForegroundColor Yellow
    & "$PSScriptRoot\grant-gmail-invoker.ps1"
    exit $LASTEXITCODE
  }

  Write-Host ""
  Write-Host "Deploy finished with IAM warnings. Run: npm run firebase:grant:gmail" -ForegroundColor Yellow
  exit $LASTEXITCODE
}
finally {
  Remove-Item Env:NODE_TLS_REJECT_UNAUTHORIZED -ErrorAction SilentlyContinue
}
