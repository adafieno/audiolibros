const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log("🔍 Looking for Khipu Studio window...");

try {
    // Create a temporary PowerShell script
    const psScript = path.join(__dirname, 'temp-capture.ps1');
    const outputPath = path.join(__dirname, `test-capture-${Date.now()}.png`);
    
    const scriptContent = `
# Find the Vite + React + TS window
$process = Get-Process | Where-Object { $_.MainWindowTitle -eq "Vite + React + TS" } | Select-Object -First 1

if (-not $process) {
    Write-Host "ERROR: Window not found"
    exit 1
}

Write-Host "Found window: $($process.MainWindowTitle) (PID: $($process.Id))"

# Load required assemblies
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# Take full screen screenshot (we can crop later if needed)
$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bitmap = New-Object System.Drawing.Bitmap $screen.Width, $screen.Height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)

# Copy screen to bitmap
$graphics.CopyFromScreen(0, 0, 0, 0, $bitmap.Size)

# Save the image
$bitmap.Save("${outputPath}", [System.Drawing.Imaging.ImageFormat]::Png)

# Clean up
$graphics.Dispose()
$bitmap.Dispose()

Write-Host "Screenshot saved: ${outputPath}"
`;

    // Write the script to a file
    fs.writeFileSync(psScript, scriptContent);
    
    // Execute the PowerShell script
    console.log("📝 Executing PowerShell script...");
    const result = execSync(`powershell.exe -ExecutionPolicy Bypass -File "${psScript}"`, { encoding: 'utf8' });
    
    console.log("PowerShell output:", result);
    
    // Clean up the script file
    fs.unlinkSync(psScript);
    
    // Check if screenshot was created
    if (fs.existsSync(outputPath)) {
        const stats = fs.statSync(outputPath);
        console.log(`✅ Screenshot captured: ${outputPath} (${(stats.size / 1024).toFixed(1)} KB)`);
        
        console.log("\n🎯 Success! The window capture works. Now we need to:");
        console.log("1. Focus the window");
        console.log("2. Navigate using clicks on the sidebar");
        console.log("3. Take screenshots of each page");
        console.log("\nSince the app doesn't have Alt+number shortcuts, we'll need to use mouse clicks.");
        
    } else {
        console.log("❌ Screenshot file was not created");
    }

} catch (error) {
    console.error("❌ Error:", error.message);
    if (error.stdout) console.log("STDOUT:", error.stdout);
    if (error.stderr) console.log("STDERR:", error.stderr);
}