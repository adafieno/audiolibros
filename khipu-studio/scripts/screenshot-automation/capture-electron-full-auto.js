const { exec } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

class AutomatedElectronCapture {
  constructor() {
    this.screenshotDir = path.join(__dirname, 'docs', 'images', 'user-guide');
    this.screenshotIndex = 1;
  }

  async setupDirectories() {
    const dirs = ['workflow', 'modules', 'navigation', 'features'];
    for (const dir of dirs) {
      await fs.mkdir(path.join(this.screenshotDir, dir), { recursive: true });
    }
    console.log('✅ Screenshot directories created');
  }

  async captureElectronWindow(filename, description = '') {
    return new Promise((resolve) => {
      const fullPath = path.join(this.screenshotDir, filename);
      
      console.log(`📸 [${this.screenshotIndex}] ${description || filename}`);
      
      const psScript = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# Find the Electron window by title
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class Win32 {
    [DllImport("user32.dll")]
    public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsDelegate lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern int GetWindowTextLength(IntPtr hWnd);
    
    public delegate bool EnumWindowsDelegate(IntPtr hWnd, IntPtr lParam);
}
public struct RECT {
    public int Left, Top, Right, Bottom;
}
"@

try {
    # Find Electron window
    $electronWindow = $null
    $callback = {
        param([IntPtr]$hWnd, [IntPtr]$lParam)
        
        if ([Win32]::IsWindowVisible($hWnd)) {
            $length = [Win32]::GetWindowTextLength($hWnd)
            if ($length -gt 0) {
                $sb = New-Object System.Text.StringBuilder($length + 1)
                [Win32]::GetWindowText($hWnd, $sb, $sb.Capacity)
                $title = $sb.ToString()
                
                if ($title -like "*Vite*React*TS*" -or $title -like "*Khipu Studio*") {
                    $script:electronWindow = $hWnd
                    return $false # Stop enumeration
                }
            }
        }
        return $true # Continue enumeration
    }
    
    [Win32]::EnumWindows($callback, [IntPtr]::Zero)
    
    if ($electronWindow -eq $null) {
        Write-Output "ERROR: Khipu Studio window not found"
        exit 1
    }
    
    # Bring window to front and get its bounds
    [Win32]::SetForegroundWindow($electronWindow)
    Start-Sleep -Milliseconds 800
    
    $rect = New-Object RECT
    [Win32]::GetWindowRect($electronWindow, [ref]$rect)
    
    $width = $rect.Right - $rect.Left
    $height = $rect.Bottom - $rect.Top
    
    # Capture the window
    $bitmap = New-Object System.Drawing.Bitmap($width, $height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $bitmap.Size)
    
    # Save screenshot
    $bitmap.Save("${fullPath}", [System.Drawing.Imaging.ImageFormat]::Png)
    
    $graphics.Dispose()
    $bitmap.Dispose()
    
    Write-Output "SUCCESS"
    
} catch {
    Write-Output "ERROR: $($_.Exception.Message)"
}
      `;

      exec(`powershell -Command "${psScript}"`, (error, stdout, stderr) => {
        if (stdout.includes('SUCCESS')) {
          console.log(`   ✅ Saved: ${filename}`);
          this.screenshotIndex++;
          resolve(true);
        } else {
          console.log(`   ❌ Failed: ${stdout || error?.message}`);
          resolve(false);
        }
      });
    });
  }

  async sendKeystrokes(keys) {
    return new Promise((resolve) => {
      const psScript = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait("${keys}")
      `;
      
      exec(`powershell -Command "${psScript}"`, () => {
        setTimeout(resolve, 1500); // Wait for UI to respond
      });
    });
  }

  async runAutomatedCapture() {
    try {
      console.log('🚀 FULLY AUTOMATED Electron Screenshot Capture');
      console.log('🎯 Target: Running "Vite + React + TS" window\n');
      
      await this.setupDirectories();
      
      console.log('📋 IMPORTANT: Do NOT touch mouse/keyboard during capture!');
      console.log('⏳ Starting in 5 seconds... Make sure Khipu Studio is visible\n');
      
      // Countdown
      for (let i = 5; i >= 1; i--) {
        console.log(`   ${i}...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      console.log('🎬 Starting capture sequence...\n');
      
      const workflow = [
        {
          module: 'Navigation',
          keys: '', // No navigation - just capture current view
          screenshots: [
            { file: 'navigation/navigation-overview.png', desc: 'Navigation bar overview' }
          ]
        },
        {
          module: 'Home',
          keys: '%1', // Alt+1 for Home
          screenshots: [
            { file: 'workflow/01-home-new-project.png', desc: 'Home screen with New Project' }
          ]
        },
        {
          module: 'Book',
          keys: '%2', // Alt+2 for Book
          screenshots: [
            { file: 'workflow/02-book-metadata-form.png', desc: 'Book metadata form' }
          ]
        },
        {
          module: 'Manuscript',
          keys: '%3', // Alt+3 for Manuscript
          screenshots: [
            { file: 'workflow/03-manuscript-editor.png', desc: 'Manuscript editor interface' }
          ]
        },
        {
          module: 'Characters',
          keys: '%4', // Alt+4 for Characters
          screenshots: [
            { file: 'workflow/04-characters-tab.png', desc: 'Characters tab main view' },
            { file: 'workflow/04-characters-detection-start.png', desc: 'Character detection interface' }
          ]
        },
        {
          module: 'Casting',
          keys: '%5', // Alt+5 for Casting
          screenshots: [
            { file: 'workflow/05-casting-character-list.png', desc: 'Character casting interface' }
          ]
        },
        {
          module: 'Planning',
          keys: '%6', // Alt+6 for Planning
          screenshots: [
            { file: 'workflow/06-planning-auto-segments.png', desc: 'Planning with AI segments' }
          ]
        },
        {
          module: 'Voice',
          keys: '%7', // Alt+7 for Voice
          screenshots: [
            { file: 'workflow/07-voice-generation-queue.png', desc: 'Voice generation interface' }
          ]
        },
        {
          module: 'Cost',
          keys: '%8', // Alt+8 for Cost
          screenshots: [
            { file: 'workflow/08-cost-tracking-dashboard.png', desc: 'Cost tracking dashboard' }
          ]
        },
        {
          module: 'Packaging',
          keys: '%9', // Alt+9 for Packaging
          screenshots: [
            { file: 'workflow/09-packaging-export-options.png', desc: 'Packaging export options' }
          ]
        }
      ];

      for (const step of workflow) {
        console.log(`📋 Module: ${step.module}`);
        
        // Send keyboard shortcut to navigate (if not navigation overview)
        if (step.keys) {
          console.log(`   🧭 Navigation: ${step.keys.replace('%', 'Alt+')}`);
          await this.sendKeystrokes(step.keys);
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for tab to load
        }
        
        // Take screenshots for this module
        for (const screenshot of step.screenshots) {
          await this.captureElectronWindow(screenshot.file, screenshot.desc);
          await new Promise(resolve => setTimeout(resolve, 1000)); // Brief pause between screenshots
        }
      }
      
      console.log('\n🎉 AUTOMATED CAPTURE COMPLETED!');
      console.log(`📁 Screenshots saved to: ${this.screenshotDir}`);
      console.log(`📊 Total screenshots captured: ${this.screenshotIndex - 1}`);
      console.log('\n✨ You can now use your mouse and keyboard again!');
      
    } catch (error) {
      console.error('\n❌ Automated capture failed:', error.message);
    }
  }
}

async function main() {
  const capture = new AutomatedElectronCapture();
  await capture.runAutomatedCapture();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = AutomatedElectronCapture;