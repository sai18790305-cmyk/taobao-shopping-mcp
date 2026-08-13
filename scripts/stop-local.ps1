[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Stop-ProcessTree([int]$ProcessId) {
  if (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue) {
    & taskkill.exe /PID $ProcessId /T /F 2>$null | Out-Null
  }
}

$localAppData = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { Join-Path $env:USERPROFILE "AppData\Local" }
$runtimeDirectory = Join-Path $localAppData "taobao-shopping-mcp\runtime"
$statePath = Join-Path $runtimeDirectory "processes.json"

if (-not (Test-Path -LiteralPath $statePath)) {
  Write-Host "taobao-shopping-mcp is not running."
  exit 0
}

$state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
Stop-ProcessTree ([int]$state.tunnelPid)
Stop-ProcessTree ([int]$state.serverPid)
Remove-Item -LiteralPath $statePath -Force
Write-Host "Taobao shopping MCP, tunnel-client, and the managed Chrome process tree are stopped."
