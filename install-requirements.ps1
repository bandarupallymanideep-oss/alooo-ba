<#
.SYNOPSIS
  SADARAKSHAK - Automated Dependency & Hardware Verification Script
  Installs required Python dependencies, verifies PyTorch & OpenVINO runtime, and tests YOLO11 model loading.
#>

[CmdletBinding()]
param(
  [switch]$ForceReinstall
)

$ErrorActionPreference = "Stop"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "   SADARAKSHAK - Windows Prerequisite & Environment Setup   " -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# 1. Check Windows Version
$os = Get-CimInstance Win32_OperatingSystem
Write-Host "`n[1/6] Inspecting Operating System..." -ForegroundColor Yellow
Write-Host "  OS: $($os.Caption) ($($os.Version)) Architecture: $($os.OSArchitecture)" -ForegroundColor Gray

if ($os.Version -lt "10.0.17763") {
  Write-Warning "SADARAKSHAK requires Windows 10 (Build 1809+) or Windows 11 64-bit."
}

# 2. Check Hardware & Accelerator Support
Write-Host "`n[2/6] Inspecting CPU & GPU Acceleration Hardware..." -ForegroundColor Yellow
$cpu = (Get-CimInstance Win32_Processor | Select-Object -First 1).Name
Write-Host "  CPU: $cpu" -ForegroundColor Gray

$gpus = Get-CimInstance Win32_VideoController
foreach ($gpu in $gpus) {
  Write-Host "  GPU: $($gpu.Name) (Driver: $($gpu.DriverVersion))" -ForegroundColor Gray
}

# 3. Locate Python Interpreter
Write-Host "`n[3/6] Detecting Python Installation..." -ForegroundColor Yellow
$pythonExe = $null

$candidates = @(
  "$PSScriptRoot\backend\venv\Scripts\python.exe",
  "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe",
  "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
  "C:\Python311\python.exe",
  "C:\Python312\python.exe",
  "C:\Python314\python.exe",
  (Get-Command python.exe -ErrorAction SilentlyContinue).Source
)

foreach ($c in $candidates) {
  if ($c -and (Test-Path $c)) {
    try {
      $ver = & $c --version 2>&1
      Write-Host "  Found: $c ($ver)" -ForegroundColor Green
      $pythonExe = $c
      break
    } catch {}
  }
}

if (-not $pythonExe) {
  Write-Host "`n[ERROR] Python is not installed or not in PATH." -ForegroundColor Red
  Write-Host "Please install Python 3.11 or 3.12 64-bit from https://www.python.org/downloads/" -ForegroundColor Red
  Write-Host "Be sure to check 'Add python.exe to PATH' during installation." -ForegroundColor Red
  exit 1
}

# 4. Virtual Environment Creation
$backendDir = Join-Path $PSScriptRoot "backend"
$venvDir = Join-Path $backendDir "venv"
$venvPython = Join-Path $venvDir "Scripts\python.exe"

Write-Host "`n[4/6] Setting Up Isolated Virtual Environment in $venvDir..." -ForegroundColor Yellow
if (-not (Test-Path $venvPython) -or $ForceReinstall) {
  Write-Host "  Creating virtual environment..." -ForegroundColor Gray
  & $pythonExe -m venv $venvDir
  if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to create virtual environment." -ForegroundColor Red
    exit 1
  }
} else {
  Write-Host "  Existing virtual environment detected." -ForegroundColor Green
}

# 5. Install Dependencies
Write-Host "`n[5/6] Installing Backend Dependencies (FastAPI, PyTorch, OpenVINO, OpenCV)..." -ForegroundColor Yellow
$reqFile = Join-Path $backendDir "requirements.txt"

if (Test-Path $reqFile) {
  & $venvPython -m pip install --upgrade pip
  & $venvPython -m pip install -r $reqFile
  if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] pip install failed. Please inspect the log above." -ForegroundColor Red
    exit 1
  }
} else {
  Write-Warning "requirements.txt not found in $backendDir."
}

# 6. Verify PyTorch, Ultralytics, and Model Loading
Write-Host "`n[6/6] Verifying PyTorch Import & YOLO11 Model Loading..." -ForegroundColor Yellow

$testScript = @"
import sys
import os
sys.path.insert(0, r'$backendDir')

try:
    import torch
    print(f'  [PASS] PyTorch {torch.__version__} loaded successfully.')
    print(f'         CUDA Runtime Available: {torch.cuda.is_available()}')
except Exception as e:
    print(f'  [FAIL] PyTorch import failed: {e}')
    sys.exit(2)

try:
    import ultralytics
    print(f'  [PASS] Ultralytics {ultralytics.__version__} loaded.')
except Exception as e:
    print(f'  [FAIL] Ultralytics import failed: {e}')
    sys.exit(3)

try:
    from sadarakshak.components.model_trainer import ModelTrainer
    mt = ModelTrainer()
    print(f'  [PASS] YOLO11 Model loaded ({len(mt.class_names)} classes) on {mt.device} ({mt.engine})')
    print(f'         Warmup Inference Latency: {mt.warmup_ms:.1f} ms')
except Exception as e:
    print(f'  [FAIL] Model loading failed: {e}')
    sys.exit(4)

print('  [SUCCESS] All backend dependencies verified!')
"@

$verifyFile = Join-Path $env:TEMP "sadarakshak_verify_$PID.py"
Set-Content -Path $verifyFile -Value $testScript

try {
  & $venvPython $verifyFile
  $verifyResult = $LASTEXITCODE
} finally {
  Remove-Item $verifyFile -ErrorAction SilentlyContinue
}

if ($verifyResult -eq 0) {
  Write-Host "`n============================================================" -ForegroundColor Green
  Write-Host "  SADARAKSHAK Environment is Ready!                         " -ForegroundColor Green
  Write-Host "  Run .\start-sadarakshak.ps1 to launch the application.    " -ForegroundColor Green
  Write-Host "============================================================" -ForegroundColor Green
} else {
  Write-Host "`n[WARNING] Verification encountered errors (Exit Code $verifyResult)." -ForegroundColor Red
  Write-Host "If Windows Application Control blocked a DLL (WinError 4551), verify that the directory has execute permissions." -ForegroundColor Yellow
  exit $verifyResult
}
