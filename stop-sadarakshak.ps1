<#
.SYNOPSIS
  SADARAKSHAK - Clean Process Terminator
  Gracefully stops running SADARAKSHAK backend, uvicorn, and Electron instances.
#>

[CmdletBinding()]
param(
  [int]$Port = 8000
)

Write-Host "Stopping SADARAKSHAK processes..." -ForegroundColor Cyan

# 1. Kill any process listening on the backend port
try {
  $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  foreach ($conn in $connections) {
    $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
    if ($proc) {
      Write-Host "  Stopping backend listener (PID: $($proc.Id), Process: $($proc.ProcessName))..." -ForegroundColor Yellow
      Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    }
  }
} catch {}

# 2. Kill SADARAKSHAK desktop executable if running
$desktopProcs = Get-Process -Name "SADARAKSHAK" -ErrorAction SilentlyContinue
foreach ($p in $desktopProcs) {
  Write-Host "  Stopping SADARAKSHAK app (PID: $($p.Id))..." -ForegroundColor Yellow
  Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
}

Write-Host "SADARAKSHAK stopped cleanly." -ForegroundColor Green
