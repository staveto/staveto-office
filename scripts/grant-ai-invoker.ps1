# Grant Cloud Run Invoker to allUsers for Staveto AI callables (browser SDK).
# Requires gcloud with Owner / Run Admin on project staveto-mvp-5f251.

$ErrorActionPreference = "Stop"
$Project = "staveto-mvp-5f251"
$Region = "europe-west1"
$Services = @(
  "generateprojectdraft",
  "updateprojectdraftwithai",
  "createprojectfromdraft"
)

Write-Host "Project: $Project  Region: $Region" -ForegroundColor Cyan
gcloud config set project $Project

foreach ($svc in $Services) {
  Write-Host "Granting roles/run.invoker to allUsers on $svc ..." -ForegroundColor Yellow
  gcloud run services add-iam-policy-binding $svc `
    --region=$Region `
    --member="allUsers" `
    --role="roles/run.invoker"
}

Write-Host "Done. Retry AI draft generation in the browser." -ForegroundColor Green
