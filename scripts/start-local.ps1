[CmdletBinding()]
param(
  [ValidateRange(1, 65535)]
  [int]$Port = 3000
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Get-RequiredEnvironment([string]$Name) {
  $value = [Environment]::GetEnvironmentVariable($Name, "Process")
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "Missing required environment variable: $Name"
  }
  return $value
}

function Stop-ProcessTree([int]$ProcessId) {
  & taskkill.exe /PID $ProcessId /T /F 2>$null | Out-Null
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$localAppData = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { Join-Path $env:USERPROFILE "AppData\Local" }
$runtimeDirectory = Join-Path $localAppData "taobao-shopping-mcp\runtime"
$statePath = Join-Path $runtimeDirectory "processes.json"
$startedProcessIds = [System.Collections.Generic.List[int]]::new()

$apiKey = Get-RequiredEnvironment "CONTROL_PLANE_API_KEY"
$tunnelId = Get-RequiredEnvironment "OPENAI_MCP_TUNNEL_ID"
$null = $apiKey

$nodeCommand = Get-Command node.exe -ErrorAction Stop
$npmCommand = Get-Command npm.cmd -ErrorAction Stop
$tunnelExecutable = if ($env:TAOBAO_TUNNEL_CLIENT_PATH) {
  (Get-Item -LiteralPath $env:TAOBAO_TUNNEL_CLIENT_PATH -ErrorAction Stop).FullName
} else {
  (Get-Command tunnel-client.exe -ErrorAction Stop).Source
}

$chromeCandidates = [System.Collections.Generic.List[string]]::new()
if ($env:TAOBAO_CHROME_PATH) { $chromeCandidates.Add($env:TAOBAO_CHROME_PATH) }
if ($env:ProgramFiles) { $chromeCandidates.Add((Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe")) }
if (${env:ProgramFiles(x86)}) { $chromeCandidates.Add((Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe")) }
if ($env:LOCALAPPDATA) { $chromeCandidates.Add((Join-Path $env:LOCALAPPDATA "Google\Chrome\Application\chrome.exe")) }
$chromePath = $chromeCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
if (-not $chromePath) {
  throw "Google Chrome was not found. Install Chrome or set TAOBAO_CHROME_PATH."
}

New-Item -ItemType Directory -Force -Path $runtimeDirectory | Out-Null
if (Test-Path -LiteralPath $statePath) {
  $previousState = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
  $stillRunning = @($previousState.serverPid, $previousState.tunnelPid) | Where-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue }
  if ($stillRunning.Count -gt 0) { throw "taobao-shopping-mcp is already running. Use stop-local.ps1 first." }
  Remove-Item -LiteralPath $statePath -Force
}

$env:PORT = [string]$Port
$env:TAOBAO_CHROME_PATH = $chromePath
if (-not $env:TAOBAO_PROFILE_DIR) { $env:TAOBAO_PROFILE_DIR = Join-Path $localAppData "taobao-shopping-mcp\taobao-profile" }
if (-not $env:HEADLESS) { $env:HEADLESS = "false" }
$mcpUrl = "http://127.0.0.1:$Port/mcp"

$sha256 = [System.Security.Cryptography.SHA256]::Create()
try {
  $hashBytes = $sha256.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($tunnelId))
} finally {
  $sha256.Dispose()
}
$profileSuffix = (-join ($hashBytes | ForEach-Object { $_.ToString("x2") })).Substring(0, 12)
$tunnelProfile = "taobao-shopping-$profileSuffix"
$profileMarker = Join-Path $runtimeDirectory "$tunnelProfile.initialized"

try {
  Push-Location $projectRoot
  & $npmCommand.Source ci
  if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }
  & $npmCommand.Source run build
  if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }

  $serverProcess = Start-Process -FilePath $nodeCommand.Source -ArgumentList @("dist/server.js") -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru
  $startedProcessIds.Add($serverProcess.Id)

  $healthy = $false
  foreach ($attempt in 1..30) {
    Start-Sleep -Milliseconds 250
    if ($serverProcess.HasExited) { throw "Local MCP server exited during startup" }
    try {
      $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 1
      if ($health.ok -eq $true) { $healthy = $true; break }
    } catch {}
  }
  if (-not $healthy) { throw "Local MCP health check timed out" }

  if (-not (Test-Path -LiteralPath $profileMarker)) {
    $initArguments = @("init", "--sample", "sample_mcp_stdio_local", "--profile", $tunnelProfile, "--tunnel-id", $tunnelId, "--mcp-server-url", $mcpUrl)
    & $tunnelExecutable @initArguments *> $null
    if ($LASTEXITCODE -ne 0) { throw "tunnel-client init failed" }
    New-Item -ItemType File -Force -Path $profileMarker | Out-Null
  }

  & $tunnelExecutable doctor --profile $tunnelProfile --explain *> $null
  if ($LASTEXITCODE -ne 0) { throw "tunnel-client doctor failed" }

  $tunnelProcess = Start-Process -FilePath $tunnelExecutable -ArgumentList @("run", "--profile", $tunnelProfile) -WindowStyle Hidden -PassThru
  $startedProcessIds.Add($tunnelProcess.Id)
  Start-Sleep -Seconds 1
  if ($tunnelProcess.HasExited) { throw "tunnel-client exited during startup" }

  [pscustomobject]@{
    serverPid = $serverProcess.Id
    tunnelPid = $tunnelProcess.Id
    port = $Port
  } | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding utf8

  Write-Host "Taobao shopping MCP is running locally at $mcpUrl"
  Write-Host "Chrome will open on the first browser tool call. Use stop-local.ps1 to stop everything."
} catch {
  foreach ($processId in $startedProcessIds) { Stop-ProcessTree $processId }
  Remove-Item -LiteralPath $statePath -Force -ErrorAction SilentlyContinue
  throw
} finally {
  Pop-Location
}
