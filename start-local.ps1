param(
  [ValidateRange(1024,65535)][int]$Port = 4180,
  [switch]$Open
)

$ErrorActionPreference = 'Stop'
$projectDirectory = $PSScriptRoot
$pageUrl = "http://localhost:$Port/travel.html"
$healthUrl = "http://127.0.0.1:$Port/travel.html"
$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($listener) {
  $response = Invoke-WebRequest -UseBasicParsing -Uri $healthUrl -TimeoutSec 5
  if ($response.StatusCode -ne 200 -or $response.Content -notmatch 'travel-map-explorer.css') {
    throw "Port $Port is occupied by another service. Choose a different -Port."
  }
  Write-Output "Lvzang is already running: $pageUrl"
} else {
  $nodeExecutable = (Get-Command node -ErrorAction Stop).Source
  $logDirectory = Join-Path $projectDirectory "artifacts/local-server/$Port"
  New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
  $previousPort = $env:PORT
  try {
    $env:PORT = [string]$Port
    $serverProcess = Start-Process -FilePath $nodeExecutable -ArgumentList @('--use-env-proxy','--env-file-if-exists=.env','server.js') -WorkingDirectory $projectDirectory -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDirectory 'server.out.log') -RedirectStandardError (Join-Path $logDirectory 'server.err.log') -PassThru
  } finally {
    $env:PORT = $previousPort
  }
  $serverProcess.Id | Set-Content -LiteralPath (Join-Path $logDirectory 'server.pid')
  $ready = $false
  for ($attempt = 0; $attempt -lt 24; $attempt++) {
    if ($serverProcess.HasExited) {throw "Local server failed to start. See $logDirectory/server.err.log."}
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $healthUrl -TimeoutSec 2
      if ($response.StatusCode -eq 200 -and $response.Content -match 'travel-map-explorer.css') {$ready = $true; break}
    } catch {}
    Start-Sleep -Milliseconds 250
  }
  if (!$ready) {throw "Server has not become ready. See $logDirectory/server.err.log."}
  Write-Output "Lvzang is running in the background (PID $($serverProcess.Id)): $pageUrl"
}
if ($Open) {Start-Process $pageUrl}
