# Grant public Cloud Run invoker for Gmail OAuth (Gen2 functions on Cloud Run).
# Run after firebase deploy if you see "Failed to set invoker".
# Requires gcloud logged in as Owner / Run Admin on staveto-mvp-5f251.

$ErrorActionPreference = "Stop"
$Project = "staveto-mvp-5f251"
$Region = "europe-west1"
$Services = @("gmailoauthcallback", "gmailbuildauthurl")

Write-Host "Project: $Project  Region: $Region" -ForegroundColor Cyan
gcloud config set project $Project

foreach ($svc in $Services) {
  Write-Host "Granting roles/run.invoker to allUsers on $svc ..." -ForegroundColor Yellow
  gcloud run services add-iam-policy-binding $svc `
    --region=$Region `
    --member="allUsers" `
    --role="roles/run.invoker"
}

Write-Host ""
Write-Host "Cleaning up duplicate us-central1 functions (if any)..." -ForegroundColor Yellow
$env:NODE_TLS_REJECT_UNAUTHORIZED = "0"
firebase functions:delete gmailBuildAuthUrl gmailOAuthCallback --region us-central1 --force 2>$null
Remove-Item Env:NODE_TLS_REJECT_UNAUTHORIZED -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Done. OAuth callback URL:" -ForegroundColor Green
Write-Host "  https://europe-west1-staveto-mvp-5f251.cloudfunctions.net/gmailOAuthCallback"
