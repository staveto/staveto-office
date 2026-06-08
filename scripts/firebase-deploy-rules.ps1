# Deploy Firestore + Storage rules when Firebase CLI fails with:
#   Failed to make request to https://firebaserules.googleapis.com/...
# Windows schannel / CRL check (CRYPT_E_NO_REVOCATION_CHECK) — same fix as firebase-login-attest-workaround.ps1

param(
  [string[]]$Only = @("firestore:rules", "storage")
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\enable-node.ps1"
Set-Location (Resolve-Path "$PSScriptRoot\..")

$onlyArg = ($Only -join ",")

Write-Host ""
Write-Host "Deploying Firebase rules ($onlyArg) with TLS verification relaxed for this session only." -ForegroundColor Yellow
Write-Host ""

$env:NODE_TLS_REJECT_UNAUTHORIZED = "0"
& firebase deploy --only $onlyArg
$exit = $LASTEXITCODE
Remove-Item Env:NODE_TLS_REJECT_UNAUTHORIZED -ErrorAction SilentlyContinue
exit $exit
