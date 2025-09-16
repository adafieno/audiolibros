const { exec } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

class ElectronWindowScreenshots {
  constructor() {
    this.screenshotDir = path.join(__dirname, 'screenshots');
    this.currentLangDir = '';
    this.screenshotIndex = 1;
    this.languages = [
      { code: 'en-US', name: 'English (US)', folder: 'user-guide-en-us' },
      { code: 'es-PE', name: 'Español (Perú)', folder: 'user-guide-es-pe' },
      { code: 'pt-BR', name: 'Português (Brasil)', folder: 'user-guide-pt-br' }
    ];
    this.workflows = [
      { name: 'home-with-project', description: 'Home screen with project loaded' },
      { name: 'create-project-dialog', description: 'Create New Project dialog', action: 'dialog' },
      { name: 'book-configuration', description: 'Book Configuration (navigate to /book)' },
      { name: 'manuscript-management', description: 'Manuscript Management (navigate to /manuscript)' },
      { name: 'character-setup', description: 'Character Setup - Dossier (navigate to /dossier)' },
      { name: 'voice-casting', description: 'Voice Casting (navigate to /casting)' },
      { name: 'content-planning', description: 'Content Planning (navigate to /planning)' },
      { name: 'audio-production', description: 'Audio Production (navigate to /voice)' },
      { name: 'export-packaging', description: 'Export & Packaging (navigate to /packaging)' },
      { name: 'settings-configuration', description: 'Settings & Configuration (navigate to /settings)' }
    ];
  }

  async setupDirectories() {
    await fs.mkdir(this.screenshotDir, { recursive: true });
    
    for (const lang of this.languages) {
      const langDir = path.join(this.screenshotDir, lang.folder);
      await fs.mkdir(langDir, { recursive: true });
    }
  }

  async findElectronWindow() {
    return new Promise((resolve) => {
      // PowerShell script to find Electron window
      const psScript = `
        $processes = Get-Process | Where-Object {
          $_.ProcessName -like "*electron*" -or 
          $_.MainWindowTitle -like "*Khipu*" -or
          $_.MainWindowTitle -like "*khipu*"
        }
        
        foreach ($proc in $processes) {
          if ($proc.MainWindowHandle -ne [System.IntPtr]::Zero -and $proc.MainWindowTitle) {
            Write-Output "$($proc.Id)|$($proc.ProcessName)|$($proc.MainWindowTitle)"
          }
        }
      `;

      exec(`powershell -Command "${psScript}"`, (error, stdout, stderr) => {
        if (error || !stdout.trim()) {
          console.log('❌ No Electron window found');
          resolve(null);
        } else {
          const lines = stdout.trim().split('\n');
          const windowInfo = lines[0].split('|');
          console.log(`✅ Found Electron window: "${windowInfo[2]}" (PID: ${windowInfo[0]})`);
          resolve({
            pid: windowInfo[0],
            processName: windowInfo[1],
            title: windowInfo[2]
          });
        }
      });
    });
  }

  async captureElectronWindow(windowInfo, filename) {
    return new Promise((resolve) => {
      const psScript = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# Add Win32 API
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
public struct RECT {
    public int Left, Top, Right, Bottom;
}
"@

try {
    # Get the process by PID
    $process = Get-Process -Id ${windowInfo.pid} -ErrorAction Stop
    $hwnd = $process.MainWindowHandle
    
    if ($hwnd -eq [System.IntPtr]::Zero) {
        Write-Output "ERROR: Window handle is null"
        exit 1
    }
    
    # Bring window to foreground
    [Win32]::SetForegroundWindow($hwnd)
    [Win32]::ShowWindow($hwnd, 9) # SW_RESTORE
    Start-Sleep -Milliseconds 500
    
    # Get window rectangle
    $rect = New-Object RECT
    $result = [Win32]::GetWindowRect($hwnd, [ref]$rect)
    
    if (-not $result) {
        Write-Output "ERROR: Could not get window rectangle"
        exit 1
    }
    
    $width = $rect.Right - $rect.Left
    $height = $rect.Bottom - $rect.Top
    
    # Capture the window
    $bitmap = New-Object System.Drawing.Bitmap($width, $height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $bitmap.Size)
    
    # Save screenshot
    $filepath = "${filename}"
    $bitmap.Save($filepath, [System.Drawing.Imaging.ImageFormat]::Png)
    
    $graphics.Dispose()
    $bitmap.Dispose()
    
    Write-Output "SUCCESS: Screenshot saved to $filepath"
    
} catch {
    Write-Output "ERROR: $($_.Exception.Message)"
    exit 1
}
      `;

      exec(`powershell -Command "${psScript}"`, (error, stdout, stderr) => {
        if (error || stdout.includes('ERROR:')) {
          console.log('❌ Screenshot failed:', stdout || error.message);
          resolve(false);
        } else {
          console.log('✅ Screenshot captured successfully');
          resolve(true);
        }
      });
    });
  }

  async takeScreenshot(name, description) {
    try {
      console.log(`📸 ${description}`);
      
      // Find the Electron window
      const windowInfo = await this.findElectronWindow();
      if (!windowInfo) {
        console.log('   ❌ Electron window not found. Make sure the app is running and visible.');
        return false;
      }
      
      const filename = `${this.screenshotIndex.toString().padStart(2, '0')}-${name}.png`;
      const filepath = path.join(this.currentLangDir, filename);
      
      // Capture the specific window
      const success = await this.captureElectronWindow(windowInfo, filepath);
      
      if (success) {
        console.log(`   ✅ Saved: ${filename}`);
        this.screenshotIndex++;
        await new Promise(resolve => setTimeout(resolve, 1500));
        return true;
      } else {
        console.log(`   ❌ Failed to capture screenshot`);
        return false;
      }
      
    } catch (error) {
      console.error(`   ❌ Error taking screenshot: ${error.message}`);
      return false;
    }
  }

  async waitForUser(message) {
    console.log(message);
    return new Promise((resolve) => {
      process.stdin.once('data', () => resolve());
    });
  }

  async captureLanguageWorkflow(language) {
    console.log(`\n🌐 Starting ${language.name} screenshot capture...`);
    
    this.currentLangDir = path.join(this.screenshotDir, language.folder);
    this.screenshotIndex = 1;

    console.log('\n📋 SETUP CHECKLIST:');
    console.log(`   • Khipu Studio Electron app is running ✓`);
    console.log(`   • test_7 project is loaded ✓`);
    console.log(`   • Language set to: ${language.name} ✓`);
    console.log(`   • Theme set to: Dark mode ✓`);
    console.log(`   • App window is visible and unobstructed ✓`);
    console.log('');

    await this.waitForUser(`🚀 Ready to capture ${language.name} screenshots? Press ENTER...`);

    // Test window detection first
    const testWindow = await this.findElectronWindow();
    if (!testWindow) {
      console.log('❌ Cannot find Electron app window. Please ensure:');
      console.log('   1. Khipu Studio app is running');
      console.log('   2. The app window is visible (not minimized)');
      console.log('   3. The app has focus or is clearly visible');
      return false;
    }

    console.log(`✅ Found app window: "${testWindow.title}"`);
    console.log('');

    // Capture workflow screenshots
    for (const workflow of this.workflows) {
      if (workflow.action === 'dialog') {
        console.log(`\n🎯 ${workflow.description}:`);
        console.log('   1. Click "Create New Project" button in the app');
        console.log('   2. Wait for dialog to fully appear');
        console.log('   3. Press ENTER to capture...');
        await this.waitForUser('');
        await this.takeScreenshot(workflow.name, workflow.description);
        
        console.log('   4. Close/Cancel the dialog');
        console.log('   5. Press ENTER when dialog is closed...');
        await this.waitForUser('');
      } else {
        console.log(`\n🎯 ${workflow.description}:`);
        console.log('   1. Navigate in the app as indicated');
        console.log('   2. Wait for page to load completely');
        console.log('   3. Press ENTER to capture...');
        await this.waitForUser('');
        await this.takeScreenshot(workflow.name, workflow.description);
      }
    }

    console.log(`\n✅ ${language.name} screenshots completed!`);
    console.log(`📂 Saved in: ${language.folder}/`);
    return true;
  }

  async automateAllLanguages() {
    console.log('🚀 ELECTRON WINDOW SCREENSHOT AUTOMATION');
    console.log('📱 Captures ONLY the Electron app window (not dev environment)');
    console.log('🎯 Specifically finds and screenshots Khipu Studio app');
    console.log('');

    await this.setupDirectories();

    console.log('📋 REQUIREMENTS:');
    console.log('   • Windows OS (uses PowerShell for window capture)');
    console.log('   • Khipu Studio Electron app running');
    console.log('   • App window visible and unobstructed');
    console.log('   • test_7 project loaded in the app');
    console.log('');

    await this.waitForUser('🔥 Ready to start? Press ENTER...');

    // Capture each language
    for (let i = 0; i < this.languages.length; i++) {
      const language = this.languages[i];
      
      const success = await this.captureLanguageWorkflow(language);
      if (!success) {
        console.log(`❌ Failed to capture ${language.name} screenshots. Stopping.`);
        break;
      }
      
      // Prepare for next language
      if (i < this.languages.length - 1) {
        const nextLang = this.languages[i + 1];
        console.log('\n🔄 LANGUAGE CHANGE REQUIRED:');
        console.log(`   Next: ${nextLang.name}`);
        console.log('   1. In the Khipu Studio app, go to Settings');
        console.log(`   2. Change language to: ${nextLang.name}`);
        console.log('   3. Return to home page');
        console.log('   4. Verify project is still loaded');
        console.log('');
        await this.waitForUser(`Ready for ${nextLang.name}? Press ENTER...`);
      }
    }

    console.log('\n🎉 SCREENSHOT AUTOMATION COMPLETED!');
    console.log(`📊 Captured screenshots for User Guide documentation`);
    console.log(`🎯 App-specific window capture (not dev environment)`);
    console.log('✨ Ready for documentation integration!');
  }
}

// Run the automation
if (require.main === module) {
  const automator = new ElectronWindowScreenshots();
  automator.automateAllLanguages().catch(console.error);
}

module.exports = ElectronWindowScreenshots;