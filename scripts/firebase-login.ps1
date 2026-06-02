$ErrorActionPreference = "Stop"
. "$PSScriptRoot\enable-node.ps1"
Set-Location (Resolve-Path "$PSScriptRoot\..")
& npm.cmd run firebase:login
