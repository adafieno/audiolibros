# PowerShell script to capture Khipu Studio screenshots
# Requires the app to be running

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

function Capture-Window {
    param(
        [string]$WindowTitle,
        [string]$OutputPath,
        [string]$Description
    )
    
    Write-Host "📸 Capturing: $Description" -ForegroundColor Green
    
    # Find the window
    $signature = @'
[DllImport("user32.dll")]
public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);

[DllImport("user32.dll")]
public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

[DllImport("user32.dll")]
public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, int nFlags);

public struct RECT
{
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
}
'@

    Add-Type -MemberDefinition $signature -Name Win32 -Namespace Win32Functions
    
    # Get window handle - try multiple possible titles
    $windowTitles = @(
        "Khipu Studio",
        "*Khipu*",
        "*Electron*",
        "*React*"
    )
    
    $hwnd = [IntPtr]::Zero
    foreach ($title in $windowTitles) {
        $processes = Get-Process | Where-Object { $_.MainWindowTitle -like $title }
        if ($processes) {
            $hwnd = $processes[0].MainWindowHandle
            break
        }
    }
    
    if ($hwnd -eq [IntPtr]::Zero) {
        Write-Host "❌ Could not find window with title containing '$WindowTitle'" -ForegroundColor Red
        return $false
    }
    
    # Get window rectangle
    $rect = New-Object Win32Functions.Win32+RECT
    [Win32Functions.Win32]::GetWindowRect($hwnd, [ref]$rect) | Out-Null
    
    $width = $rect.Right - $rect.Left
    $height = $rect.Bottom - $rect.Top
    
    # Create bitmap
    $bitmap = New-Object System.Drawing.Bitmap($width, $height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $hdc = $graphics.GetHdc()
    
    # Capture window
    [Win32Functions.Win32]::PrintWindow($hwnd, $hdc, 0) | Out-Null
    
    $graphics.ReleaseHdc($hdc)
    $graphics.Dispose()
    
    # Save image
    $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bitmap.Dispose()
    
    Write-Host "   Saved: $(Split-Path $OutputPath -Leaf)" -ForegroundColor Cyan
    return $true
}

function Main {
    Write-Host "🚀 Starting Khipu Studio screenshot capture..." -ForegroundColor Yellow
    
    # Create screenshots directory
    $screenshotsDir = Join-Path $PSScriptRoot "powershell-screenshots"
    if (!(Test-Path $screenshotsDir)) {
        New-Item -ItemType Directory -Path $screenshotsDir | Out-Null
    }
    
    # Check if app is running
    $appProcesses = Get-Process | Where-Object { 
        $_.ProcessName -like "*electron*" -or 
        $_.MainWindowTitle -like "*Khipu*" -or
        $_.MainWindowTitle -like "*React*"
    }
    
    if (!$appProcesses) {
        Write-Host "❌ Khipu Studio doesn't appear to be running." -ForegroundColor Red
        Write-Host "Please start the app with: npm run dev" -ForegroundColor Yellow
        return
    }
    
    Write-Host "✅ Found running app process(es)" -ForegroundColor Green
    
    # Capture screenshots with delays for manual navigation
    $screenshots = @(
        @{ Name = "01-current-state"; Description = "Current application state"; Delay = 0 },
        @{ Name = "02-after-navigation"; Description = "After manual navigation (Press Enter when ready)"; Delay = -1 },
        @{ Name = "03-another-view"; Description = "Another view (Press Enter when ready)"; Delay = -1 },
        @{ Name = "04-final-state"; Description = "Final state (Press Enter when ready)"; Delay = -1 }
    )
    
    foreach ($shot in $screenshots) {
        if ($shot.Delay -eq -1) {
            Write-Host "`n⏸️  Navigate to the desired screen, then press Enter..." -ForegroundColor Yellow
            Read-Host
        } elseif ($shot.Delay -gt 0) {
            Start-Sleep -Seconds $shot.Delay
        }
        
        $outputPath = Join-Path $screenshotsDir "$($shot.Name).png"
        Capture-Window -WindowTitle "Khipu" -OutputPath $outputPath -Description $shot.Description
    }
    
    Write-Host "`n✅ Screenshot capture completed!" -ForegroundColor Green
    Write-Host "📁 Screenshots saved in: $screenshotsDir" -ForegroundColor Cyan
    
    # Open screenshots folder
    Start-Process $screenshotsDir
}

# Run the script
Main