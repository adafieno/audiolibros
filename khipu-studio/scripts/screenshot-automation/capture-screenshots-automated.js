const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log("📸 Khipu Studio Screenshot Automation");
console.log("=====================================");

// Ensure screenshots directory exists
const screenshotsDir = path.join(__dirname, 'docs', 'images', 'user-guide');
if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
}

// Define navigation targets based on the app structure
const navigationPlan = [
    { name: 'home', description: 'Home page - Project selection', sidebarIndex: 0 },
    { name: 'book', description: 'Book Information module', sidebarIndex: 1 },
    { name: 'project', description: 'Project Setup module', sidebarIndex: 2 },
    { name: 'manuscript', description: 'Manuscript Import module', sidebarIndex: 3 },
    { name: 'casting', description: 'Voice Casting module', sidebarIndex: 4 },
    { name: 'characters', description: 'Character Detection module', sidebarIndex: 5 },
    { name: 'planning', description: 'Planning module', sidebarIndex: 6 },
    { name: 'voice', description: 'Voice Production module', sidebarIndex: 7 },
    { name: 'packaging', description: 'Packaging module', sidebarIndex: 8 },
    { name: 'cost', description: 'Cost Analysis module', sidebarIndex: 9 },
    { name: 'settings', description: 'Settings page', sidebarIndex: 10 }
];

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function captureScreenshots() {
    try {
        console.log("\n🔍 Locating Khipu Studio window...");
        
        // Create PowerShell script for window operations
        const psScriptPath = path.join(__dirname, 'temp-automation.ps1');
        
        for (let i = 0; i < navigationPlan.length; i++) {
            const item = navigationPlan[i];
            console.log(`\n📍 Step ${i + 1}/${navigationPlan.length}: ${item.description}`);
            
            const outputPath = path.join(screenshotsDir, `${String(i + 1).padStart(2, '0')}-${item.name}.png`);
            
            // PowerShell script to focus window, click sidebar item, and capture
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
[Win32]::ShowWindow($hwnd, 3)  # SW_MAXIMIZE
[Win32]::SetForegroundWindow($hwnd)

# Wait for window to be focused and ready
Start-Sleep -Milliseconds 1000

# Get window rectangle for click positioning
$rect = New-Object Win32+RECT
[Win32]::GetWindowRect($hwnd, [ref]$rect)
$windowWidth = $rect.Right - $rect.Left
$windowHeight = $rect.Bottom - $rect.Top

Write-Host "Window positioned at ($($rect.Left), $($rect.Top)) with size $windowWidth x $windowHeight"

# Calculate sidebar click position
# The window rect includes borders, so adjust for that
# Header is 56px, then sidebar starts with 8px padding
# Each nav item is about 12px padding + 28px icon + 12px padding + 8px gap = ~60px total
$borderOffset = 8  # Window border offset
$headerHeight = 56  # Header height from CSS
$sidebarPadding = 8  # Sidebar top padding
$itemHeight = 60    # Approximate height per nav item (padding + icon + gap)

$sidebarX = $rect.Left + $borderOffset + 44  # Center of 88px wide sidebar
$sidebarStartY = $rect.Top + $borderOffset + $headerHeight + $sidebarPadding + 70  # Start even lower for first nav item center
$clickY = $sidebarStartY + (${item.sidebarIndex} * $itemHeight)

Write-Host "Clicking sidebar item ${item.sidebarIndex} at position ($sidebarX, $clickY)"

# Click the sidebar item
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point($sidebarX, $clickY)
Start-Sleep -Milliseconds 500  # Wait longer for mouse positioning to complete

# Simulate mouse click
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Application]::DoEvents()

# Use Windows API to click
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

Write-Host "Clicking at ($sidebarX, $clickY)..."
[MouseClick]::mouse_event([MouseClick]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
Start-Sleep -Milliseconds 100  # Longer click duration
[MouseClick]::mouse_event([MouseClick]::MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)

# Wait for page to load and transition to complete
Start-Sleep -Milliseconds 2000

Write-Host "Taking screenshot after navigation..."

# Take screenshot
$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bitmap = New-Object System.Drawing.Bitmap $screen.Width, $screen.Height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen(0, 0, 0, 0, $bitmap.Size)
$bitmap.Save("${outputPath}", [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()

Write-Host "Screenshot saved: ${outputPath}"
`;

            // Write and execute the script
            fs.writeFileSync(psScriptPath, scriptContent);
            
            try {
                const result = execSync(`powershell.exe -ExecutionPolicy Bypass -File "${psScriptPath}"`, { 
                    encoding: 'utf8',
                    timeout: 10000 // 10 second timeout
                });
                
                console.log("  Result:", result.split('\n').filter(line => line.trim()).pop());
                
                // Verify screenshot was created
                if (fs.existsSync(outputPath)) {
                    const stats = fs.statSync(outputPath);
                    console.log(`  ✅ Captured (${(stats.size / 1024).toFixed(1)} KB)`);
                } else {
                    console.log(`  ❌ Failed to create screenshot`);
                }
                
            } catch (error) {
                console.log(`  ❌ Error: ${error.message}`);
            }
            
            // Small delay between screenshots
            await sleep(1000);
        }
        
        // Clean up
        if (fs.existsSync(psScriptPath)) {
            fs.unlinkSync(psScriptPath);
        }
        
        console.log(`\n✅ Screenshot automation complete!`);
        console.log(`📁 Screenshots saved to: ${screenshotsDir}`);
        
        // List captured files
        const files = fs.readdirSync(screenshotsDir).filter(f => f.endsWith('.png'));
        console.log(`📊 Captured ${files.length} screenshots:`);
        files.forEach(file => {
            const stats = fs.statSync(path.join(screenshotsDir, file));
            console.log(`   - ${file} (${(stats.size / 1024).toFixed(1)} KB)`);
        });
        
    } catch (error) {
        console.error("❌ Automation failed:", error.message);
    }
}

// Start the automation
console.log("\n🚀 Starting automation in 3 seconds...");
console.log("⚠️  Please don't use mouse/keyboard during automation!");

setTimeout(() => {
    captureScreenshots();
}, 3000);