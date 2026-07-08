$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Node = Join-Path $Root "tools\node\win-x64\node.exe"
$Cli = Join-Path $Root "bin\config-indexer.mjs"

if (-not (Test-Path -LiteralPath $Node -PathType Leaf)) {
    Write-Error "Local Node.js was not found: $Node"
    exit 9009
}

& $Node $Cli @args
exit $LASTEXITCODE
