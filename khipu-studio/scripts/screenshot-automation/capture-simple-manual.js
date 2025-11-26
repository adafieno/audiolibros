const { exec } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

class SimpleElectronCapture {
  constructor() {
    this.screenshotDir = path.join(__dirname, 'screenshots');
    this.screenshotIndex = 1;
  }

  async setupDirectories() {
    const dirs = ['user-guide-en-us', 'user-guide-es-pe', 'user-guide-pt-br'];
    for (const dir of dirs) {
      await fs.mkdir(path.join(this.screenshotDir, dir), { recursive: true });
    }
  }

  async captureWindow(filename) {
    return new Promise((resolve) => {
      const psScript = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
}
public struct RECT {
    public int Left, Top, Right, Bottom;
}
"@

try {
    # Get the currently active window
    $hwnd = [Win32]::GetForegroundWindow()
    
    if ($hwnd -eq [System.IntPtr]::Zero) {
        Write-Output "ERROR: No active window"
        exit 1
    }
    
    # Get window rectangle
    $rect = New-Object RECT
    [Win32]::GetWindowRect($hwnd, [ref]$rect)
    
    $width = $rect.Right - $rect.Left
    $height = $rect.Bottom - $rect.Top
    
    # Capture the window
    $bitmap = New-Object System.Drawing.Bitmap($width, $height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $bitmap.Size)
    
    # Save screenshot
    $bitmap.Save("${filename}", [System.Drawing.Imaging.ImageFormat]::Png)
    
    $graphics.Dispose()
    $bitmap.Dispose()
    
    Write-Output "SUCCESS"
    
} catch {
    Write-Output "ERROR: $($_.Exception.Message)"
}
      `;

      exec(`powershell -Command "${psScript}"`, (error, stdout, stderr) => {
        if (stdout.includes('SUCCESS')) {
          resolve(true);
        } else {
          console.log('Screenshot error:', stdout || error?.message);
          resolve(false);
        }
      });
    });
  }

  async runCapture() {
    console.log('🚀 SIMPLE ELECTRON SCREENSHOT CAPTURE');
    console.log('📱 Captures whatever window is currently active/focused');
    console.log('');
    console.log('📋 INSTRUCTIONS:');
    console.log('1. Start Electron app in separate window: npm run dev');
    console.log('2. Load test_7 project, set dark theme, English language');
    console.log('3. Focus the Electron app window');
    console.log('4. Follow the prompts below');
    console.log('');

    await this.setupDirectories();

    const screenshots = [
      { name: 'home-with-project', desc: 'Home screen with project' },
      { name: 'create-dialog', desc: 'Create dialog (click Create New first)' },
      { name: 'book-config', desc: 'Book Configuration (/book)' },
      { name: 'manuscript', desc: 'Manuscript (/manuscript)' },
      { name: 'dossier', desc: 'Dossier (/dossier)' },
      { name: 'casting', desc: 'Casting (/casting)' },
      { name: 'planning', desc: 'Planning (/planning)' },
      { name: 'voice', desc: 'Voice (/voice)' },
      { name: 'packaging', desc: 'Packaging (/packaging)' },
      { name: 'settings', desc: 'Settings (/settings)' }
    ];

    console.log('🎯 ENGLISH SCREENSHOTS:');
    
    for (const shot of screenshots) {
      console.log(`\n📸 ${shot.desc}:`);
      console.log('   1. Make sure Electron app is showing the right screen');
      console.log('   2. Click on the Electron app to focus it');
      console.log('   3. Press ENTER to capture...');
      
      await new Promise(resolve => process.stdin.once('data', resolve));
      
      const filename = path.join(this.screenshotDir, 'user-guide-en-us', `${this.screenshotIndex.toString().padStart(2, '0')}-${shot.name}.png`);
      
      console.log('   📷 Capturing in 2 seconds... (focus the Electron app now!)');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const success = await this.captureWindow(filename);
      if (success) {
        console.log(`   ✅ Saved: ${shot.name}.png`);
        this.screenshotIndex++;
      } else {
        console.log(`   ❌ Failed to capture`);
      }
    }

    console.log('\n🎉 English screenshots done!');
    console.log('\n🔄 FOR SPANISH & PORTUGUESE:');
    console.log('   Change language in Electron app settings');
    console.log('   Run this script again');
    console.log('   Update the language folder in the script');
  }
}

const capture = new SimpleElectronCapture();
capture.runCapture().catch(console.error);