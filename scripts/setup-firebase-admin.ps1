# Firebase Admin without JSON key (org policy blocks key creation)
# Uses: gcloud auth application-default login
# Run: npm run setup:firebase-admin

$ErrorActionPreference = "Stop"
$Project = "staveto-mvp-5f251"

Write-Host "=== Firebase Admin (bez JSON kluca) ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Vasa Google organizacia blokuje stiahnutie service account kluca."
Write-Host "Riesenie: prihlasenie cez gcloud (Application Default Credentials)."
Write-Host ""
Write-Host "Otvori sa prehliadac - prihlaste sa ako info@staveto.sk"
Write-Host ""

gcloud auth application-default login --project=$Project

if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "Ak gcloud zlyha (SSL/VPN), skuste:" -ForegroundColor Yellow
  Write-Host "  1. Vypnut VPN"
  Write-Host "  2. Spustit znova: npm run setup:firebase-admin"
  Write-Host ""
  Write-Host "Alternativa: Cloud Functions (Gmail OAuth bez lokalneho Admin SDK)"
  Write-Host "  npm run firebase:grant:gmail"
  exit 1
}

Write-Host ""
Write-Host "Hotovo. Restartujte dev server: npm run dev" -ForegroundColor Green
Write-Host "Potom App Center - Gmail - Verbinden"
