<#
.SYNOPSIS
  SADARAKSHAK - Windows Application Launcher
  Starts the local FastAPI backend engine and launches the SADARAKSHAK desktop application.
#>

[CmdletBinding()]
param(
  [switch]$WebOnly,
  [int]$Port = 8000
)

$backendDir = Join-Path $PSScriptRoot "backend"
$desktopDir = Join-Path $PSScriptRoot "desktop"
$frontendDir = Join-Path $PSScriptRoot "frontend"

$pythonExe = Join-Path $backendDir "venv\Scripts\python.exe"

if (-not (Test-Path $pythonExe)) {
  Write-Host "[INFO] Python virtual environment not found. Running setup..." -ForegroundColor Yellow
  & (Join-Path $PSScriptRoot "install-requirements.ps1")
  if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Environment setup failed." -ForegroundColor Red
    exit 1
  }
}

# 1. Start Backend if not already responding
Write-Host "[1/2] Checking SADARAKSHAK Backend on port $Port..." -ForegroundColor Cyan
$backendHealthy = $false
try {
  $res = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 2 -ErrorAction SilentlyContinue
  if ($res.status -eq "ok") {
    $backendHealthy = $true
    Write-Host "  Backend is already running." -ForegroundColor Green
  }
} catch {}

if (-not $backendHealthy) {
  Write-Host "  Starting FastAPI + YOLO11 backend engine..." -ForegroundColor Yellow
  $backendJob = Start-Process -FilePath $pythonExe `
    -ArgumentList "-m uvicorn app:app --host 127.0.0.1 --port $Port" `
    -WorkingDirectory $backendDir `
    -WindowStyle Hidden `
    -PassThru

  # Wait for backend health
  $attempts = 0
  while ($attempts -lt 40) {
    Start-Sleep -Milliseconds 600
    try {
      $res = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 2 -ErrorAction SilentlyContinue
      if ($res.status -eq "ok") {
        $backendHealthy = $true
        Write-Host "  Backend engine is healthy! (PID: $($backendJob.Id))" -ForegroundColor Green
        break
      }
    } catch {}
    $attempts++
  }

  if (-not $backendHealthy) {
    Write-Host "[ERROR] Backend failed to start. Check backend logs." -ForegroundColor Red
    exit 1
  }
}

# 2. Launch Interface
if ($WebOnly) {
  Write-Host "[2/2] Opening Web Interface in browser..." -ForegroundColor Cyan
  Start-Process "http://127.0.0.1:$Port"
} else {
  # Check for built desktop app executable or electron runner
  $desktopExe = Join-Path $desktopDir "dist-release\win-unpacked\SADARAKSHAK.exe"
  $launched = $false
  if (Test-Path $desktopExe) {
    try {
      Write-Host "[2/2] Launching SADARAKSHAK Desktop Application..." -ForegroundColor Cyan
      $proc = Start-Process $desktopExe -ErrorAction Stop -PassThru
      $launched = $true
    } catch {
      if ($_.Exception.Message -match "Application Control policy") {
        Write-Host "  [INFO] Windows Application Control (WDAC) blocked unsigned binary." -ForegroundColor Yellow
        Write-Host "  Launching via approved Electron runtime..." -ForegroundColor Yellow
      } else {
        Write-Warning "Could not start ${desktopExe}: $($_.Exception.Message)"
      }
    }
  }
  if (-not $launched) {
    Write-Host "[2/2] Launching Electron Desktop window..." -ForegroundColor Cyan
    Set-Location $desktopDir
    & npx.cmd electron .
  }
}

Write-Host "`nSADARAKSHAK is running! To stop, run .\stop-sadarakshak.ps1" -ForegroundColor Green
