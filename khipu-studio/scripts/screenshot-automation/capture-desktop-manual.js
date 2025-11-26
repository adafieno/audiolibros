const { exec } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

class DesktopAppCapture {
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

  async captureWindow(filename, description = '') {
    return new Promise((resolve) => {
      const fullPath = path.join(this.screenshotDir, filename);
      
      console.log(`📸 [${this.screenshotIndex}] ${description || filename}`);
      console.log('   Focus Khipu Studio window and press Enter...');
      
      // Wait for user to focus the window
      process.stdin.once('data', () => {
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
    });
  }

  async pauseForNavigation(instruction) {
    return new Promise((resolve) => {
      console.log(`\n🧭 ${instruction}`);
      console.log('   Press Enter when ready...');
      process.stdin.once('data', () => {
        resolve();
      });
    });
  }

  async runManualWorkflow() {
    try {
      console.log('🚀 Starting manual desktop screenshot capture\n');
      console.log('📋 Instructions:');
      console.log('  - Keep Khipu Studio window visible');
      console.log('  - Follow navigation prompts');
      console.log('  - Focus the app window and press Enter for each screenshot\n');
      
      await this.setupDirectories();
      
      // Set raw mode for single keypress
      process.stdin.setRawMode(true);
      process.stdin.resume();
      
      const workflow = [
        {
          module: 'Home',
          instruction: 'Navigate to 🏠 Home tab',
          screenshots: [
            { file: 'workflow/01-home-new-project.png', desc: 'Home screen - New Project area' },
            { file: 'workflow/01-home-recent-projects.png', desc: 'Home screen - Recent projects (scroll if needed)' }
          ]
        },
        {
          module: 'Book',
          instruction: 'Navigate to 📖 Book tab',
          screenshots: [
            { file: 'workflow/02-book-metadata-form.png', desc: 'Book metadata form' },
            { file: 'workflow/02-book-cover-upload.png', desc: 'Book cover upload section (scroll down if needed)' }
          ]
        },
        {
          module: 'Manuscript',
          instruction: 'Navigate to 📑 Manuscript tab',
          screenshots: [
            { file: 'workflow/03-manuscript-import-options.png', desc: 'Manuscript import options' },
            { file: 'workflow/03-manuscript-editor.png', desc: 'Manuscript editor with content' }
          ]
        },
        {
          module: 'Characters',
          instruction: 'Navigate to 🎭 Characters tab',
          screenshots: [
            { file: 'workflow/04-characters-tab.png', desc: 'Characters tab main interface' },
            { file: 'workflow/04-characters-detection-start.png', desc: 'Character detection button/interface' },
            { file: 'workflow/04-characters-detected-list.png', desc: 'List of detected characters' }
          ]
        },
        {
          module: 'Casting',
          instruction: 'Navigate to 🗣️ Casting tab',
          screenshots: [
            { file: 'workflow/05-casting-character-list.png', desc: 'Character casting interface' },
            { file: 'workflow/05-casting-voice-selection.png', desc: 'Voice selection panel' }
          ]
        },
        {
          module: 'Planning',
          instruction: 'Navigate to 🪄 Planning tab',
          screenshots: [
            { file: 'workflow/06-planning-auto-segments.png', desc: 'AI-generated segments view' },
            { file: 'workflow/06-planning-segment-details.png', desc: 'Individual segment details' }
          ]
        },
        {
          module: 'Voice',
          instruction: 'Navigate to 🎙️ Voice tab',
          screenshots: [
            { file: 'workflow/07-voice-generation-queue.png', desc: 'Voice generation interface' },
            { file: 'workflow/07-voice-preview-player.png', desc: 'Audio preview player' }
          ]
        },
        {
          module: 'Cost',
          instruction: 'Navigate to 💰 Cost tab',
          screenshots: [
            { file: 'workflow/08-cost-tracking-dashboard.png', desc: 'Cost tracking dashboard' }
          ]
        },
        {
          module: 'Packaging',
          instruction: 'Navigate to 📦 Packaging tab',
          screenshots: [
            { file: 'workflow/09-packaging-export-options.png', desc: 'Export options interface' }
          ]
        }
      ];

      // First capture navigation overview
      await this.pauseForNavigation('Make sure all navigation tabs are visible');
      await this.captureWindow('navigation/navigation-overview.png', 'Navigation bar overview');

      // Go through each module
      for (const step of workflow) {
        console.log(`\n📋 Module: ${step.module}`);
        await this.pauseForNavigation(step.instruction);
        
        for (const screenshot of step.screenshots) {
          await this.captureWindow(screenshot.file, screenshot.desc);
        }
      }
      
      console.log('\n🎉 Manual screenshot capture completed!');
      console.log(`📁 Screenshots saved to: ${this.screenshotDir}`);
      console.log(`📊 Total screenshots: ${this.screenshotIndex - 1}`);
      
    } catch (error) {
      console.error('\n❌ Capture failed:', error.message);
    } finally {
      process.stdin.setRawMode(false);
      process.stdin.pause();
    }
  }

  async runQuickCapture() {
    console.log('🚀 Quick capture mode\n');
    console.log('📋 Instructions: Focus app window and press Enter for each screenshot');
    console.log('   Type "exit" and press Enter to stop\n');
    
    await this.setupDirectories();
    
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    let index = 1;
    
    const prompt = () => {
      readline.question(`\n[${index}] Screenshot filename (or "exit"): `, async (input) => {
        if (input.toLowerCase() === 'exit') {
          console.log('\n👋 Exiting quick capture mode');
          readline.close();
          return;
        }
        
        if (input.trim()) {
          const filename = input.includes('/') ? input : `workflow/${input}`;
          await this.captureWindow(filename, `Quick capture: ${input}`);
          index++;
        }
        
        prompt();
      });
    };
    
    prompt();
  }
}

async function main() {
  const capture = new DesktopAppCapture();
  const mode = process.argv[2] || 'workflow';
  
  switch (mode) {
    case 'quick':
      await capture.runQuickCapture();
      break;
    case 'workflow':
    default:
      await capture.runManualWorkflow();
      break;
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = DesktopAppCapture;