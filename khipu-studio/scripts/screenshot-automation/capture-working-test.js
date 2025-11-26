const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Debug: Check if window exists and capture it
console.log("🔍 Looking for Khipu Studio window...");

try {
    // Find the window using PowerShell
    const windowSearch = execSync(`
        $windows = Get-Process | Where-Object { $_.MainWindowTitle -eq "Vite + React + TS" } | Select-Object ProcessName, Id, MainWindowTitle;
        if ($windows) {
            $windows | ConvertTo-Json
        } else {
            '[]'
        }
    `, { encoding: 'utf8' });

    console.log("Window search result:", windowSearch);
    
    const windows = JSON.parse(windowSearch || '[]');
    
    if (!Array.isArray(windows) && windows.MainWindowTitle) {
        // Single window found
        console.log(`✅ Found window: "${windows.MainWindowTitle}" (PID: ${windows.Id})`);
    } else if (Array.isArray(windows) && windows.length > 0) {
        // Multiple windows found
        console.log(`✅ Found ${windows.length} windows:`);
        windows.forEach(w => console.log(`  - "${w.MainWindowTitle}" (PID: ${w.Id})`));
    } else {
        console.log("❌ No Khipu Studio window found. Make sure the app is running.");
        process.exit(1);
    }

    // Take a test screenshot
    console.log("\n📸 Taking test screenshot...");
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const outputPath = path.join(__dirname, `test-capture-${timestamp}.png`);
    
    // Use PowerShell to capture the window
    const captureScript = `
        Add-Type -AssemblyName System.Windows.Forms;
        Add-Type -AssemblyName System.Drawing;
        
        # Find the window
        $process = Get-Process | Where-Object { $_.MainWindowTitle -eq "Vite + React + TS" } | Select-Object -First 1;
        if ($process -eq $null) {
            Write-Host "ERROR: No window found";
            exit 1;
        }
        
        # Get window handle
        $hwnd = $process.MainWindowHandle;
        
        # Import necessary functions
        Add-Type @"
            using System;
            using System.Runtime.InteropServices;
            using System.Drawing;
            using System.Drawing.Imaging;
            
            public class WindowCapture {
                [DllImport("user32.dll")]
                public static extern IntPtr GetWindowRect(IntPtr hWnd, ref RECT rect);
                
                [DllImport("user32.dll")]
                public static extern IntPtr GetDC(IntPtr hWnd);
                
                [DllImport("user32.dll")]
                public static extern IntPtr ReleaseDC(IntPtr hWnd, IntPtr hDC);
                
                [DllImport("gdi32.dll")]
                public static extern IntPtr CreateCompatibleDC(IntPtr hdc);
                
                [DllImport("gdi32.dll")]
                public static extern IntPtr CreateCompatibleBitmap(IntPtr hdc, int nWidth, int nHeight);
                
                [DllImport("gdi32.dll")]
                public static extern IntPtr SelectObject(IntPtr hdc, IntPtr hgdiobj);
                
                [DllImport("gdi32.dll")]
                public static extern bool BitBlt(IntPtr hdc, int nXDest, int nYDest, int nWidth, int nHeight, IntPtr hdcSrc, int nXSrc, int nYSrc, uint dwRop);
                
                [DllImport("gdi32.dll")]
                public static extern bool DeleteObject(IntPtr hObject);
                
                [DllImport("gdi32.dll")]
                public static extern bool DeleteDC(IntPtr hdc);
                
                [StructLayout(LayoutKind.Sequential)]
                public struct RECT {
                    public int Left;
                    public int Top;
                    public int Right;
                    public int Bottom;
                }
                
                public static Bitmap CaptureWindow(IntPtr handle) {
                    RECT windowRect = new RECT();
                    GetWindowRect(handle, ref windowRect);
                    int width = windowRect.Right - windowRect.Left;
                    int height = windowRect.Bottom - windowRect.Top;
                    
                    IntPtr hdcSrc = GetDC(handle);
                    IntPtr hdcDest = CreateCompatibleDC(hdcSrc);
                    IntPtr hBitmap = CreateCompatibleBitmap(hdcSrc, width, height);
                    IntPtr hOld = SelectObject(hdcDest, hBitmap);
                    BitBlt(hdcDest, 0, 0, width, height, hdcSrc, 0, 0, 0x00CC0020);
                    
                    SelectObject(hdcDest, hOld);
                    DeleteDC(hdcDest);
                    ReleaseDC(handle, hdcSrc);
                    
                    Bitmap bitmap = Bitmap.FromHbitmap(hBitmap);
                    DeleteObject(hBitmap);
                    
                    return bitmap;
                }
            }
"@
        
        # Capture the window
        $bitmap = [WindowCapture]::CaptureWindow($hwnd);
        $bitmap.Save("${outputPath}", [System.Drawing.Imaging.ImageFormat]::Png);
        $bitmap.Dispose();
        
        Write-Host "Screenshot saved: ${outputPath}";
    `;
    
    execSync(captureScript, { encoding: 'utf8' });
    
    // Check if file was created
    if (fs.existsSync(outputPath)) {
        const stats = fs.statSync(outputPath);
        console.log(`✅ Screenshot captured: ${outputPath} (${(stats.size / 1024).toFixed(1)} KB)`);
    } else {
        console.log("❌ Screenshot file was not created");
    }

} catch (error) {
    console.error("❌ Error:", error.message);
    if (error.stdout) console.log("STDOUT:", error.stdout);
    if (error.stderr) console.log("STDERR:", error.stderr);
}