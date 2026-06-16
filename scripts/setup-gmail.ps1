# Gmail one-time setup for Staveto Office
# Run: npm run setup:gmail

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\enable-node.ps1"
$root = Resolve-Path "$PSScriptRoot\.."
Set-Location $root

Write-Host "=== Staveto Gmail Setup ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "This enables one-click Gmail connect in Staveto Manager."
Write-Host ""

$clientId = "255961550157-gaueraial600f02qa3qadki41fhvabit.apps.googleusercontent.com"
$localCallback = "http://localhost:3000/api/gmail/oauth/callback"
$cloudCallback = "https://europe-west1-staveto-mvp-5f251.cloudfunctions.net/gmailOAuthCallback"

Write-Host "Step 1: Google Cloud Console" -ForegroundColor Yellow
Write-Host "  Enable Gmail API:"
Write-Host "  https://console.cloud.google.com/apis/library/gmail.googleapis.com?project=staveto-mvp-5f251"
Write-Host ""
Write-Host "  OAuth Web client -> Authorized redirect URIs:"
Write-Host "    $localCallback"
Write-Host "    $cloudCallback"
Write-Host "  https://console.cloud.google.com/apis/credentials?project=staveto-mvp-5f251"
Write-Host ""

$secret = Read-Host "Step 2: Paste OAuth Client SECRET (Web client, not Client ID)"

if (-not $secret.Trim()) {
  Write-Host "Secret is required." -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "Step 3: Firebase secret + Gmail functions..." -ForegroundColor Yellow
Write-Host "(TLS workaround for Windows — same as firebase:deploy:rules)" -ForegroundColor DarkGray
Write-Host ""

$env:NODE_TLS_REJECT_UNAUTHORIZED = "0"
try {
  $secret.Trim() | firebase functions:secrets:set GMAIL_CLIENT_SECRET --data-file - --force
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Warning: secret upload failed. Retry manually or use .env.local for localhost only." -ForegroundColor Yellow
  }

  npm run build --prefix functions
  & firebase deploy --only "functions:gmailOAuthCallback,functions:gmailBuildAuthUrl"
  if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Deploy failed. Try: npm run firebase:deploy:gmail" -ForegroundColor Red
    Write-Host "Local dev still works if GMAIL_CLIENT_SECRET is in .env.local." -ForegroundColor Yellow
  }
}
finally {
  Remove-Item Env:NODE_TLS_REJECT_UNAUTHORIZED -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "Updating .env.local for local dev..." -ForegroundColor Yellow
$envPath = Join-Path $root ".env.local"
$envBody = if (Test-Path $envPath) { Get-Content -Path $envPath -Raw } else { "" }
if ($envBody -match "GMAIL_CLIENT_SECRET=") {
  $envBody = $envBody -replace "GMAIL_CLIENT_SECRET=.*", "GMAIL_CLIENT_SECRET=$($secret.Trim())"
} else {
  $envBody += "`nGMAIL_CLIENT_ID=$clientId`nGMAIL_CLIENT_SECRET=$($secret.Trim())`nGMAIL_REDIRECT_URI=$localCallback`nNEXT_PUBLIC_APP_URL=http://localhost:3000`n"
}
Set-Content -Path $envPath -Value $envBody.TrimEnd() -Encoding UTF8
Write-Host "Saved GMAIL_CLIENT_SECRET to .env.local" -ForegroundColor Green

Write-Host ""
Write-Host "Done! Open Staveto -> E-maily zakaznikov -> Prihlasit sa cez Google" -ForegroundColor Green
