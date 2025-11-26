const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log("🔍 Looking for Khipu Studio window...");

try {
    // Simple approach: just check if the process exists
    const processCheck = execSync(`
        $process = Get-Process | Where-Object { $_.MainWindowTitle -eq "Vite + React + TS" } | Select-Object -First 1;
        if ($process) {
            Write-Host "FOUND:$($process.ProcessName):$($process.Id):$($process.MainWindowTitle)";
        } else {
            Write-Host "NOT_FOUND";
        }
    `, { encoding: 'utf8' }).trim();

    console.log("Process check result:", processCheck);

    if (!processCheck.startsWith('FOUND:')) {
        console.log("❌ No Khipu Studio window found. Make sure the app is running.");
        process.exit(1);
    }

    const [, processName, processId, windowTitle] = processCheck.split(':');
    console.log(`✅ Found window: "${windowTitle}" (${processName}, PID: ${processId})`);

    // Take a test screenshot
    console.log("\n📸 Taking test screenshot...");
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const outputPath = path.join(__dirname, `test-capture-${timestamp}.png`);
    
    // Simple PowerShell screenshot using Add-Type
    const screenshotScript = `
        Add-Type -AssemblyName System.Windows.Forms;
        Add-Type -AssemblyName System.Drawing;
        
        # Get the process
        $process = Get-Process | Where-Object { $_.MainWindowTitle -eq "Vite + React + TS" } | Select-Object -First 1;
        if (-not $process) {
            Write-Host "ERROR: Process not found";
            exit 1;
        }
        
        # Get screen bounds
        $screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds;
        $width = $screen.Width;
        $height = $screen.Height;
        
        # Create bitmap and graphics object
        $bitmap = New-Object System.Drawing.Bitmap $width, $height;
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap);
        
        # Copy screen to bitmap
        $graphics.CopyFromScreen(0, 0, 0, 0, $bitmap.Size);
        
        # Save screenshot
        $bitmap.Save("${outputPath}", [System.Drawing.Imaging.ImageFormat]::Png);
        
        # Cleanup
        $graphics.Dispose();
        $bitmap.Dispose();
        
        Write-Host "Screenshot saved to: ${outputPath}";
    `;
    
    execSync(screenshotScript, { encoding: 'utf8' });
    
    // Check if file was created
    if (fs.existsSync(outputPath)) {
        const stats = fs.statSync(outputPath);
        console.log(`✅ Screenshot captured: ${outputPath} (${(stats.size / 1024).toFixed(1)} KB)`);
        console.log("🎯 This proves we can find and capture the window. Now we need to add navigation!");
    } else {
        console.log("❌ Screenshot file was not created");
    }

} catch (error) {
    console.error("❌ Error:", error.message);
    if (error.stdout) console.log("STDOUT:", error.stdout);
    if (error.stderr) console.log("STDERR:", error.stderr);
}