$releaseDir = 'm:\Nirikshan\desktop\dist-release'
$portableStaging = Join-Path $releaseDir 'SADARAKSHAK-Windows-Portable'
$portableZip = Join-Path $releaseDir 'SADARAKSHAK-Windows-Portable.zip'
$installerExe = Join-Path $releaseDir 'SADARAKSHAK-Setup-x64.exe'

Write-Host "Creating staging directory for Portable package..." -ForegroundColor Cyan
if (Test-Path $portableStaging) { Remove-Item -Recurse -Force $portableStaging }
New-Item -ItemType Directory -Force -Path $portableStaging | Out-Null

Write-Host "Copying application binaries..." -ForegroundColor Cyan
Copy-Item -Recurse (Join-Path $releaseDir 'win-unpacked\*') $portableStaging

Write-Host "Copying setup scripts and guides..." -ForegroundColor Cyan
Copy-Item 'm:\Nirikshan\install-requirements.ps1' $portableStaging
Copy-Item 'm:\Nirikshan\start-sadarakshak.ps1' $portableStaging
Copy-Item 'm:\Nirikshan\stop-sadarakshak.ps1' $portableStaging
Copy-Item 'm:\Nirikshan\README-DESKTOP.md' (Join-Path $portableStaging 'README.md')

Write-Host "Archiving into SADARAKSHAK-Windows-Portable.zip..." -ForegroundColor Cyan
if (Test-Path $portableZip) { Remove-Item -Force $portableZip }
Compress-Archive -Path (Join-Path $portableStaging '*') -DestinationPath $portableZip -CompressionLevel Optimal

Write-Host "Distributing release files to website downloads folders..." -ForegroundColor Cyan
$destDirs = @('m:\Nirikshan\backend\downloads', 'm:\Nirikshan\frontend\public\downloads', 'm:\Nirikshan\frontend\dist\downloads')
foreach ($dest in $destDirs) {
  if (-not (Test-Path $dest)) { New-Item -ItemType Directory -Force -Path $dest | Out-Null }
  Copy-Item $installerExe $dest -Force
  Copy-Item $portableZip $dest -Force
  Write-Host "  -> Copied to $dest" -ForegroundColor Green
}

Write-Host "`nRelease Assets Summary:" -ForegroundColor Yellow
Get-ChildItem 'm:\Nirikshan\backend\downloads' | Select-Object Name, Length, LastWriteTime
