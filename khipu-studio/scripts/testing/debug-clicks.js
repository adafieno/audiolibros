const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log("🔍 Debug: Testing sidebar click positions");

// Let's test just the first few clicks to see what's happening
const testClicks = [
    { name: 'home', description: 'Home page - Project selection', sidebarIndex: 0 },
    { name: 'book', description: 'Book Information module', sidebarIndex: 1 },
    { name: 'project', description: 'Project Setup module', sidebarIndex: 2 }
];

async function debugClicks() {
    const psScriptPath = path.join(__dirname, 'debug-clicks.ps1');
    
    for (let i = 0; i < testClicks.length; i++) {
        const item = testClicks[i];
        console.log(`\n🎯 Testing click ${i + 1}: ${item.description} (sidebar index ${item.sidebarIndex})`);
        
        const scriptContent = `
# Find and focus the Khipu Studio window
$process = Get-Process | Where-Object { $_.MainWindowTitle -eq "Vite + React + TS" } | Select-Object -First 1
if (-not $process) {
    Write-Host "ERROR: Khipu Studio window not found"
    exit 1
}

# Import required assemblies
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# Get window handle and bring to front
Add-Type @"
    using System;
    using System.Runtime.InteropServices;
    public class Win32 {
        [DllImport("user32.dll")]
        public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
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

# Get window rectangle
$rect = New-Object Win32+RECT
[Win32]::GetWindowRect($hwnd, [ref]$rect)
$windowWidth = $rect.Right - $rect.Left
$windowHeight = $rect.Bottom - $rect.Top

Write-Host "Window: ($($rect.Left), $($rect.Top)) to ($($rect.Right), $($rect.Bottom))"
Write-Host "Size: $windowWidth x $windowHeight"

# Calculate click positions - let's try different approaches
$sidebarX = $rect.Left + 50  # 50px from left edge
$itemHeight = 60
$sidebarStartY = $rect.Top + 100  # Start 100px from top

# Current formula
$clickY1 = $sidebarStartY + (${item.sidebarIndex} * $itemHeight)
Write-Host "Current formula click position: ($sidebarX, $clickY1)"

# Alternative formula - maybe the sidebar starts higher
$altStartY = $rect.Top + 120
$clickY2 = $altStartY + (${item.sidebarIndex} * $itemHeight)
Write-Host "Alternative formula click position: ($sidebarX, $clickY2)"

# Let's also try different X position (maybe sidebar is narrower/wider)
$altSidebarX = $rect.Left + 44  # Try the icon center
Write-Host "Alternative X position: ($altSidebarX, $clickY1)"

# For now, let's use the original calculation but show exactly where we're clicking
Write-Host "Using click position: ($sidebarX, $clickY1)"

# Move mouse to position (so user can see where we're about to click)
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point($sidebarX, $clickY1)
Write-Host "Mouse moved to position. Press Enter to continue or Ctrl+C to abort..."

# Wait a bit so user can see the cursor position
Start-Sleep -Milliseconds 1500

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

Write-Host "Clicking now..."
[MouseClick]::mouse_event([MouseClick]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
Start-Sleep -Milliseconds 100
[MouseClick]::mouse_event([MouseClick]::MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)

Write-Host "Click completed. Waiting for navigation..."
Start-Sleep -Milliseconds 2000
Write-Host "Ready for next test."
`;

        fs.writeFileSync(psScriptPath, scriptContent);
        
        try {
            const result = execSync(`powershell.exe -ExecutionPolicy Bypass -File "${psScriptPath}"`, { 
                encoding: 'utf8',
                timeout: 15000
            });
            
            console.log("PowerShell output:");
            console.log(result);
            
        } catch (error) {
            console.log(`❌ Error: ${error.message}`);
            break;
        }
        
        // Wait before next test
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Clean up
    if (fs.existsSync(psScriptPath)) {
        fs.unlinkSync(psScriptPath);
    }
}

debugClicks();