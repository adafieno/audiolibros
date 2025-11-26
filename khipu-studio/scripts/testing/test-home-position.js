const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log("🎯 Testing Home icon position (index 0)");

async function testHomePosition() {
    const psScriptPath = path.join(__dirname, 'test-home-position.ps1');
    
    const scriptContent = `
# Find window
$process = Get-Process | Where-Object { $_.MainWindowTitle -eq "Vite + React + TS" } | Select-Object -First 1
if (-not $process) { exit 1 }

Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
    using System;
    using System.Runtime.InteropServices;
    public class Win32 {
        [DllImport("user32.dll")]
        public static extern bool SetForegroundWindow(IntPtr hWnd);
        [DllImport("user32.dll")]
        public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
        [StructLayout(LayoutKind.Sequential)]
        public struct RECT {
            public int Left; public int Top; public int Right; public int Bottom;
        }
    }
"@

$hwnd = $process.MainWindowHandle
[Win32]::SetForegroundWindow($hwnd)
Start-Sleep -Milliseconds 500

$rect = New-Object Win32+RECT
[Win32]::GetWindowRect($hwnd, [ref]$rect)

# Updated calculation
$borderOffset = 8
$headerHeight = 56
$sidebarPadding = 8
$sidebarX = $rect.Left + $borderOffset + 44
$sidebarStartY = $rect.Top + $borderOffset + $headerHeight + $sidebarPadding + 70
$homeClickY = $sidebarStartY + (0 * 60)  # Home is index 0

Write-Host "Window bounds: ($($rect.Left), $($rect.Top)) to ($($rect.Right), $($rect.Bottom))"
Write-Host "Home icon click position: ($sidebarX, $homeClickY)"
Write-Host "Breaking down the calculation:"
Write-Host "  Window top: $($rect.Top)"
Write-Host "  + Border offset: $borderOffset = $($rect.Top + $borderOffset)"
Write-Host "  + Header height: $headerHeight = $($rect.Top + $borderOffset + $headerHeight)"
Write-Host "  + Sidebar padding: $sidebarPadding = $($rect.Top + $borderOffset + $headerHeight + $sidebarPadding)"
Write-Host "  + Extra offset: 50 = $sidebarStartY"

[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point($sidebarX, $homeClickY)
Write-Host ""
Write-Host "Cursor positioned over Home icon. Does it look correct? (Y/N)"
$response = Read-Host
if ($response -eq "Y" -or $response -eq "y") {
    Write-Host "Great! The position looks good."
} else {
    Write-Host "Position needs adjustment. Try different offset values."
}
`;

    fs.writeFileSync(psScriptPath, scriptContent);
    
    try {
        execSync(`powershell.exe -ExecutionPolicy Bypass -File "${psScriptPath}"`, { 
            stdio: 'inherit'
        });
    } catch (error) {
        console.log(`❌ Error: ${error.message}`);
    }
    
    if (fs.existsSync(psScriptPath)) {
        fs.unlinkSync(psScriptPath);
    }
}

testHomePosition();