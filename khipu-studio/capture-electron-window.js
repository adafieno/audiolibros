// Simple Electron Screenshot Automation Script
// Run this while your Electron app is running to capture screenshots

const { exec } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

class SimpleElectronScreenshotAutomator {
  constructor() {
    this.screenshotDir = path.join(__dirname, 'screenshots');
    this.screenshotIndex = 1;
  }

  async ensureDirectories() {
    const languages = ['en-us', 'es-pe', 'pt-br'];
    for (const lang of languages) {
      const dir = path.join(this.screenshotDir, `user-guide-${lang}`);
      await fs.mkdir(dir, { recursive: true });
    }
  }

  async takeElectronScreenshot(windowTitle = 'Khipu Studio') {
    return new Promise((resolve) => {
      // Use PowerShell to take screenshot of specific window
      const psScript = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# Find the window
$process = Get-Process | Where-Object {$_.ProcessName -like "*electron*" -or $_.MainWindowTitle -like "*${windowTitle}*"} | Select-Object -First 1

if ($process -and $process.MainWindowHandle -ne [System.IntPtr]::Zero) {
    # Get window bounds
    $rect = New-Object RECT
    [Win32API]::GetWindowRect($process.MainWindowHandle, [ref]$rect)
    
    $width = $rect.Right - $rect.Left
    $height = $rect.Bottom - $rect.Top
    
    # Capture screenshot
    $bitmap = New-Object System.Drawing.Bitmap($width, $height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $bitmap.Size)
    
    # Save to file
    $filename = "${this.screenshotIndex.toString().padStart(2, '0')}-screenshot.png"
    $filepath = "${path.join(this.screenshotDir, filename)}"
    $bitmap.Save($filepath, [System.Drawing.Imaging.ImageFormat]::Png)
    
    $graphics.Dispose()
    $bitmap.Dispose()
    
    Write-Output "Screenshot saved: $filepath"
} else {
    Write-Output "Window not found"
}

# Add Win32API type if not already added
if (-not ([System.Management.Automation.PSTypeName]'Win32API').Type) {
    Add-Type @"
    using System;
    using System.Runtime.InteropServices;
    public class Win32API {
        [DllImport("user32.dll")]
        public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    }
    public struct RECT {
        public int Left;
        public int Top; 
        public int Right;
        public int Bottom;
    }
"@
}
      `;

      exec(`powershell -Command "${psScript}"`, (error, stdout, stderr) => {
        if (error) {
          console.error('Screenshot error:', error);
          resolve(false);
        } else {
          console.log(stdout);
          this.screenshotIndex++;
          resolve(true);
        }
      });
    });
  }

  async automateScreenshots() {
    console.log('🚀 Starting Electron Screenshot Automation');
    console.log('📱 This will capture your Electron app window directly');
    console.log('');
    
    await this.ensureDirectories();

    console.log('📋 SETUP INSTRUCTIONS:');
    console.log('1. Make sure your Khipu Studio Electron app is running');
    console.log('2. Load the test_7 project');
    console.log('3. Set to dark theme and English language');
    console.log('4. Position the window clearly visible');
    console.log('5. Press ENTER to start automated capture...');
    console.log('');

    // Wait for user confirmation
    await new Promise((resolve) => {
      process.stdin.once('data', () => resolve());
    });

    const workflows = [
      { name: 'home-with-project', description: 'Home screen with project', instruction: 'Navigate to Home page' },
      { name: 'create-dialog', description: 'Create Project Dialog', instruction: 'Click Create New Project button' },
      { name: 'book-config', description: 'Book Configuration', instruction: 'Navigate to /book' },
      { name: 'manuscript', description: 'Manuscript Management', instruction: 'Navigate to /manuscript' },
      { name: 'dossier', description: 'Character Setup', instruction: 'Navigate to /dossier' },
      { name: 'casting', description: 'Voice Casting', instruction: 'Navigate to /casting' },
      { name: 'planning', description: 'Content Planning', instruction: 'Navigate to /planning' },
      { name: 'voice', description: 'Audio Production', instruction: 'Navigate to /voice' },
      { name: 'packaging', description: 'Export & Packaging', instruction: 'Navigate to /packaging' },
      { name: 'settings', description: 'Settings', instruction: 'Navigate to /settings' }
    ];

    for (const workflow of workflows) {
      console.log(`📸 Next: ${workflow.description}`);
      console.log(`   ${workflow.instruction}`);
      console.log('   Press ENTER when ready...');
      
      await new Promise((resolve) => {
        process.stdin.once('data', () => resolve());
      });

      const success = await this.takeElectronScreenshot();
      if (success) {
        console.log(`   ✅ Captured: ${workflow.name}`);
      } else {
        console.log(`   ❌ Failed to capture: ${workflow.name}`);
      }
      console.log('');
    }

    console.log('🎉 Screenshot automation completed!');
    console.log('📁 Screenshots saved in: ./screenshots/');
    console.log('');
    console.log('🔄 Repeat this process for Spanish and Portuguese languages');
    console.log('   (Change language in app settings and run again)');
  }
}

// Run the automation
if (require.main === module) {
  const automator = new SimpleElectronScreenshotAutomator();
  automator.automateScreenshots().catch(console.error);
}

module.exports = SimpleElectronScreenshotAutomator;