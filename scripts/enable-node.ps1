# Puts nvm-windows active Node on PATH for this PowerShell session only.
$nodeDir = "C:\nvm4w\nodejs"
if (-not (Test-Path "$nodeDir\node.exe")) {
    Write-Error "Node not found at $nodeDir. Open a new terminal after `nvm use 20` or reinstall nvm-windows."
    exit 1
}
if ($env:Path -notlike "*$nodeDir*") {
    $env:Path = "$nodeDir;$env:Path"
}
Write-Host "Using Node $( & "$nodeDir\node.exe" -v ) from $nodeDir"
