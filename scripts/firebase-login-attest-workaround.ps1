# Workaround when `firebase login` fails with:
#   Failed to make request to https://auth.firebase.tools/attest
# Common on Windows: corporate proxy, ESET/AV SSL scan, CRL/OCSP blocked (CRYPT_E_NO_REVOCATION_CHECK).
#
# ONLY for local login — do not commit NODE_TLS_REJECT_UNAUTHORIZED=0 to the repo.

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\enable-node.ps1"
Set-Location (Resolve-Path "$PSScriptRoot\..")

Write-Host ""
Write-Host "Attempting Firebase login with TLS verification relaxed for this session only." -ForegroundColor Yellow
Write-Host "If this still fails: try mobile hotspot, disable VPN, or use gcloud ADC (see docs/STAVETO_AI_SETUP.md)." -ForegroundColor Yellow
Write-Host ""

$env:NODE_TLS_REJECT_UNAUTHORIZED = "0"
& npm.cmd run firebase:login:no-localhost
$exit = $LASTEXITCODE
Remove-Item Env:NODE_TLS_REJECT_UNAUTHORIZED -ErrorAction SilentlyContinue
exit $exit
