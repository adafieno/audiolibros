# Clear Windows Icon Cache
Write-Host "Clearing Windows icon cache..." -ForegroundColor Cyan

# Stop Explorer
Write-Host "Stopping Windows Explorer..." -ForegroundColor Yellow
Stop-Process -Name explorer -Force

# Wait a moment
Start-Sleep -Seconds 2

# Delete icon cache files
$iconCachePath = "$env:LOCALAPPDATA\Microsoft\Windows\Explorer"
Write-Host "Deleting icon cache files from: $iconCachePath" -ForegroundColor Yellow

Get-ChildItem -Path $iconCachePath -Filter "iconcache*" -Force -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
Get-ChildItem -Path $iconCachePath -Filter "thumbcache*" -Force -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue

# Restart Explorer
Write-Host "Restarting Windows Explorer..." -ForegroundColor Yellow
Start-Process explorer.exe

Write-Host "`nIcon cache cleared successfully!" -ForegroundColor Green
Write-Host "`nNext steps:" -ForegroundColor Cyan
Write-Host "1. Uninstall Khipu Studio from Windows Settings → Apps" -ForegroundColor White
Write-Host "2. Restart your computer (recommended)" -ForegroundColor White
Write-Host "3. Install the new version from: app\dist\Khipu Studio Setup 1.0.0.exe" -ForegroundColor White
