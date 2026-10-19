<#
.SYNOPSIS
  SADARAKSHAK - Auditable Windows Defender Firewall Configuration Script
  
.DESCRIPTION
  This script configures Windows Defender Firewall safely for SADARAKSHAK:
  1. Re-enables Windows Defender Firewall on Domain, Private, and Public profiles
     (resolving the Windows Security "device may be unsafe" warning).
  2. Creates strictly scoped, least-privilege inbound firewall rules:
     - UDP: Allows inbound ONVIF WS-Discovery probe responses from local CCTV cameras.
       Restricted exclusively to the local network (RemoteAddress: LocalSubnet).
     - TCP: Allows local FastAPI communication (port 8000), restricted to loopback & LocalSubnet.
  3. Never opens port 554 or port 8000 to the public Internet.
  4. Provides auditable output and supports cleanly removing the rules via -Remove.

.PARAMETER Remove
  Removes the SADARAKSHAK firewall rules and restores default settings.

.PARAMETER WhatIf
  Simulates the configuration changes without applying them.
#>

[CmdletBinding(SupportsShouldProcess)]
param(
  [switch]$Remove
)

$ErrorActionPreference = "Stop"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "   SADARAKSHAK - Windows Defender Firewall Configuration     " -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# 1. Check for Administrative Privileges
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
  Write-Host "`n[NOTICE] Windows Firewall configuration requires Administrator privileges." -ForegroundColor Yellow
  Write-Host "Relaunching with administrative elevation (UAC prompt)..." -ForegroundColor Yellow
  
  $argList = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
  if ($Remove) { $argList += " -Remove" }

  try {
    Start-Process powershell -Verb RunAs -ArgumentList $argList
    Write-Host "[INFO] Elevated process started. Please check the elevated window." -ForegroundColor Green
  } catch {
    Write-Host "[ERROR] Could not obtain administrative elevation: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "`nTo configure manually, open PowerShell as Administrator and run:" -ForegroundColor Yellow
    Write-Host "  powershell -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -ForegroundColor White
  }
  exit
}

# 2. Locate SADARAKSHAK Python Executable
$backendDir = Join-Path $PSScriptRoot "backend"
$pythonExe = Join-Path $backendDir "venv\Scripts\python.exe"

if (-not (Test-Path $pythonExe)) {
  $pythonExe = (Get-Command python.exe -ErrorAction SilentlyContinue).Source
}

Write-Host "`n[1/3] Target Application Runtime:" -ForegroundColor Yellow
Write-Host "  Path: $pythonExe" -ForegroundColor Gray

# Rule Definitions
$ruleOnvifUdp = "SADARAKSHAK-ONVIF-Discovery-UDP"
$ruleApiTcp   = "SADARAKSHAK-Local-API-TCP"

if ($Remove) {
  Write-Host "`n[2/3] Removing SADARAKSHAK Firewall Rules..." -ForegroundColor Yellow
  Remove-NetFirewallRule -Name $ruleOnvifUdp -ErrorAction SilentlyContinue
  Remove-NetFirewallRule -Name $ruleApiTcp -ErrorAction SilentlyContinue
  Write-Host "  [OK] Firewall rules removed." -ForegroundColor Green
  exit 0
}

# 3. Re-enable Windows Defender Firewall on all profiles
Write-Host "`n[2/3] Inspecting & Enabling Windows Defender Firewall Profiles..." -ForegroundColor Yellow
$profiles = Get-NetFirewallProfile
foreach ($prof in $profiles) {
  if (-not $prof.Enabled) {
    Write-Host "  Enabling $($prof.Name) Firewall profile..." -ForegroundColor Yellow
    Set-NetFirewallProfile -Name $prof.Name -Enabled True
  } else {
    Write-Host "  $($prof.Name) Firewall profile is already Active (Enabled: True)." -ForegroundColor Green
  }
}

# 4. Add Narrowly Scoped Inbound Rules
Write-Host "`n[3/3] Configuring Narrowly Scoped Security Rules..." -ForegroundColor Yellow

# Clean up any existing rules first
Remove-NetFirewallRule -Name $ruleOnvifUdp -ErrorAction SilentlyContinue
Remove-NetFirewallRule -Name $ruleApiTcp -ErrorAction SilentlyContinue

# Rule 1: ONVIF WS-Discovery UDP (Restricted strictly to LocalSubnet)
Write-Host "  Creating Inbound UDP rule for ONVIF Discovery (Remote: LocalSubnet)..." -ForegroundColor Gray
New-NetFirewallRule `
  -Name $ruleOnvifUdp `
  -DisplayName "SADARAKSHAK - ONVIF Camera Discovery (UDP)" `
  -Description "Allows incoming ONVIF WS-Discovery responses from local CCTV cameras. Restricted strictly to LocalSubnet." `
  -Direction Inbound `
  -Action Allow `
  -Protocol UDP `
  -Program $pythonExe `
  -RemoteAddress LocalSubnet `
  -Profile Domain, Private, Public `
  -Enabled True | Out-Null
Write-Host "  [PASS] Rule '$ruleOnvifUdp' created." -ForegroundColor Green

# Rule 2: FastAPI Backend Engine TCP (Restricted to Loopback and LocalSubnet on Port 8000)
Write-Host "  Creating Inbound TCP rule for FastAPI Engine (Port 8000, Remote: 127.0.0.1, LocalSubnet)..." -ForegroundColor Gray
New-NetFirewallRule `
  -Name $ruleApiTcp `
  -DisplayName "SADARAKSHAK - Backend Engine (TCP 8000)" `
  -Description "Allows local desktop application and local subnet to connect to SADARAKSHAK API. Never exposed to public internet." `
  -Direction Inbound `
  -Action Allow `
  -Protocol TCP `
  -LocalPort 8000 `
  -Program $pythonExe `
  -RemoteAddress @("127.0.0.1", "LocalSubnet") `
  -Profile Domain, Private, Public `
  -Enabled True | Out-Null
Write-Host "  [PASS] Rule '$ruleApiTcp' created." -ForegroundColor Green

Write-Host "`n============================================================" -ForegroundColor Green
Write-Host "  Windows Defender Firewall Configured Safely!               " -ForegroundColor Green
Write-Host "  - All Windows Defender Firewall profiles are ENABLED.      " -ForegroundColor Green
Write-Host "  - Camera discovery permitted strictly on LocalSubnet.      " -ForegroundColor Green
Write-Host "  - Port 554 and Port 8000 are PROTECTED from public access. " -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
