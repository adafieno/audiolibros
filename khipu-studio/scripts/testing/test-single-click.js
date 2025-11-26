const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log("🎯 Testing improved click coordinates");

async function testImprovedClick() {
    const psScriptPath = path.join(__dirname, 'test-improved-click.ps1');
    
    const scriptContent = `
# Find and focus the Khipu Studio window
$process = Get-Process | Where-Object { $_.MainWindowTitle -eq "Vite + React + TS" } | Select-Object -First 1
if (-not $process) {
    Write-Host "ERROR: Khipu Studio window not found"
    exit 1
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

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
            public int Left;
            public int Top;
            public int Right;
            public int Bottom;
        }
    }
"@

$hwnd = $process.MainWindowHandle
[Win32]::SetForegroundWindow($hwnd)
Start-Sleep -Milliseconds 500

$rect = New-Object Win32+RECT
[Win32]::GetWindowRect($hwnd, [ref]$rect)

Write-Host "Window: ($($rect.Left), $($rect.Top)) to ($($rect.Right), $($rect.Bottom))"

# Improved calculation
$borderOffset = 8
$headerHeight = 56
$sidebarPadding = 8
$itemHeight = 60

$sidebarX = $rect.Left + $borderOffset + 44
$sidebarStartY = $rect.Top + $borderOffset + $headerHeight + $sidebarPadding + 30

# Test clicking on "Book" (index 1)
$clickY = $sidebarStartY + (1 * $itemHeight)

Write-Host "Improved click position for Book module: ($sidebarX, $clickY)"
Write-Host "  - Border offset: $borderOffset"
Write-Host "  - After header: $($rect.Top + $borderOffset + $headerHeight)"
Write-Host "  - After sidebar padding: $($rect.Top + $borderOffset + $headerHeight + $sidebarPadding)"
Write-Host "  - First item center: $sidebarStartY"

# Move cursor and wait so user can see
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point($sidebarX, $clickY)
Write-Host "Cursor positioned. Check if it's over the Book icon. Press Enter when ready..."
Read-Host

# Click
Add-Type @"
    using System;
    using System.Runtime.InteropServices;
    public class MouseClick {
        [DllImport("user32.dll")]
        public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);
        
        public const uint MOUSEEVENTF_LEFTDOWN = 0x02;
        public const uint MOUSEEVENTF_LEFTUP = 0x04;
    }
"@

Write-Host "Clicking Book icon..."
[MouseClick]::mouse_event([MouseClick]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
Start-Sleep -Milliseconds 50
[MouseClick]::mouse_event([MouseClick]::MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)

Write-Host "Click completed. Did it navigate to the Book module?"
`;

    fs.writeFileSync(psScriptPath, scriptContent);
    
    try {
        const result = execSync(`powershell.exe -ExecutionPolicy Bypass -File "${psScriptPath}"`, { 
            encoding: 'utf8',
            stdio: 'inherit'
        });
        
    } catch (error) {
        console.log(`❌ Error: ${error.message}`);
    }
    
    // Clean up
    if (fs.existsSync(psScriptPath)) {
        fs.unlinkSync(psScriptPath);
    }
}

testImprovedClick();