$ErrorActionPreference = "Stop"
. "$PSScriptRoot\enable-node.ps1"
Set-Location (Resolve-Path "$PSScriptRoot\..")
& npm.cmd run functions:build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& npm.cmd run firebase:secret
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& npm.cmd run firebase:deploy
