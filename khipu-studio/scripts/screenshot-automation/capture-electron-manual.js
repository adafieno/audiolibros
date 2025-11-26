const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs').promises;

class SimpleElectronCapture {
  constructor() {
    this.screenshotDir = path.join(__dirname, 'docs', 'images', 'user-guide');
    this.app = null;
    this.page = null;
  }

  async setupDirectories() {
    const dirs = ['workflow', 'modules', 'navigation', 'features'];
    for (const dir of dirs) {
      await fs.mkdir(path.join(this.screenshotDir, dir), { recursive: true });
    }
    console.log('✅ Screenshot directories created');
  }

  async connectToWindow() {
    try {
      console.log('🔗 Launching Electron instance...');
      
      this.app = await electron.launch({
        executablePath: path.join(__dirname, 'app', 'node_modules', 'electron', 'dist', 'electron.exe'),
        args: [path.join(__dirname, 'app')],
        headless: false
      });

      this.page = await this.app.firstWindow();
      await this.page.waitForLoadState('domcontentloaded');
      
      console.log('✅ Connected to Electron window');
      console.log('🔄 Please load your project if not already loaded');
      
      // Wait for user to set up the app
      console.log('\nPress Enter when the app is ready with your project loaded...');
      await this.waitForEnter();
      
      return true;
      
    } catch (error) {
      console.error('❌ Failed to connect:', error.message);
      return false;
    }
  }

  async waitForEnter() {
    return new Promise((resolve) => {
      process.stdin.once('data', () => resolve());
    });
  }

  async captureScreenshot(filename, description = '') {
    try {
      const fullPath = path.join(this.screenshotDir, filename);
      
      console.log(`📸 ${description || filename}`);
      console.log('   Press Enter to capture...');
      await this.waitForEnter();
      
      await this.page.screenshot({
        path: fullPath,
        type: 'png',
        fullPage: false
      });
      
      console.log(`   ✅ Saved: ${filename}\n`);
      
    } catch (error) {
      console.error(`   ❌ Failed: ${filename} - ${error.message}\n`);
    }
  }

  async runManualCapture() {
    try {
      console.log('🚀 Manual Electron Screenshot Capture\n');
      
      await this.setupDirectories();
      
      if (!(await this.connectToWindow())) {
        return;
      }
      
      console.log('📋 Manual Workflow:');
      console.log('   1. Navigate to each tab manually');
      console.log('   2. Press Enter to capture each screenshot');
      console.log('   3. Follow the prompts\n');
      
      const screenshots = [
        { file: 'navigation/navigation-overview.png', desc: 'Navigation bar overview' },
        
        // Home module
        { file: 'workflow/01-home-new-project.png', desc: 'Navigate to Home → Home screen with New Project' },
        { file: 'workflow/01-home-recent-projects.png', desc: 'Home → Recent projects area' },
        
        // Book module  
        { file: 'workflow/02-book-metadata-form.png', desc: 'Navigate to Book → Book metadata form' },
        { file: 'workflow/02-book-cover-upload.png', desc: 'Book → Cover upload section' },
        
        // Manuscript
        { file: 'workflow/03-manuscript-import-options.png', desc: 'Navigate to Manuscript → Import options' },
        { file: 'workflow/03-manuscript-editor.png', desc: 'Manuscript → Editor with content' },
        
        // Characters
        { file: 'workflow/04-characters-tab.png', desc: 'Navigate to Characters → Main interface' },
        { file: 'workflow/04-characters-detection-start.png', desc: 'Characters → Detection button/interface' },
        { file: 'workflow/04-characters-detected-list.png', desc: 'Characters → List of detected characters' },
        
        // Casting
        { file: 'workflow/05-casting-character-list.png', desc: 'Navigate to Casting → Character list' },
        { file: 'workflow/05-casting-voice-selection.png', desc: 'Casting → Voice selection panel' },
        
        // Planning
        { file: 'workflow/06-planning-auto-segments.png', desc: 'Navigate to Planning → AI segments view' },
        { file: 'workflow/06-planning-segment-details.png', desc: 'Planning → Individual segment details' },
        
        // Voice
        { file: 'workflow/07-voice-generation-queue.png', desc: 'Navigate to Voice → Generation interface' },
        { file: 'workflow/07-voice-preview-player.png', desc: 'Voice → Audio preview player' },
        
        // Cost
        { file: 'workflow/08-cost-tracking-dashboard.png', desc: 'Navigate to Cost → Dashboard view' },
        
        // Packaging
        { file: 'workflow/09-packaging-export-options.png', desc: 'Navigate to Packaging → Export options' }
      ];

      for (let i = 0; i < screenshots.length; i++) {
        const shot = screenshots[i];
        console.log(`\n[${i + 1}/${screenshots.length}] ${shot.desc}`);
        await this.captureScreenshot(shot.file, shot.desc);
      }
      
      console.log('🎉 Manual screenshot capture completed!');
      console.log(`📁 Screenshots saved to: ${this.screenshotDir}`);
      
    } catch (error) {
      console.error('\n❌ Capture failed:', error.message);
    } finally {
      if (this.app) {
        console.log('🔄 Closing Electron instance...');
        await this.app.close();
      }
    }
  }

  async runQuickCapture() {
    try {
      await this.setupDirectories();
      
      if (!(await this.connectToWindow())) {
        return;
      }
      
      console.log('🎮 Quick Capture Mode');
      console.log('Type filename and press Enter to capture, or "exit" to quit\n');
      
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      const prompt = () => {
        readline.question('Screenshot filename (or "exit"): ', async (input) => {
          if (input.toLowerCase() === 'exit') {
            readline.close();
            if (this.app) await this.app.close();
            return;
          }
          
          if (input.trim()) {
            const filename = input.includes('/') ? input : `workflow/${input}`;
            await this.captureScreenshot(filename, `Quick capture: ${input}`);
          }
          
          prompt();
        });
      };
      
      prompt();
      
    } catch (error) {
      console.error('\n❌ Quick capture failed:', error.message);
    }
  }
}

async function main() {
  const capture = new SimpleElectronCapture();
  const mode = process.argv[2] || 'manual';
  
  if (mode === 'quick') {
    await capture.runQuickCapture();
  } else {
    await capture.runManualCapture();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = SimpleElectronCapture;