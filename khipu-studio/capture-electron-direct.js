const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs').promises;

class ElectronWindowCapture {
  constructor() {
    this.screenshotDir = path.join(__dirname, 'docs', 'images', 'user-guide');
    this.app = null;
    this.page = null;
    this.screenshotIndex = 1;
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
      console.log('🔗 Connecting to "Vite + React + TS" window...');
      
      // Launch Playwright Electron with correct executable path
      this.app = await electron.launch({
        executablePath: path.join(__dirname, 'app', 'node_modules', 'electron', 'dist', 'electron.exe'),
        args: [path.join(__dirname, 'app')],
        headless: false
      });

      // Get the first (and likely only) window
      this.page = await this.app.firstWindow();
      
      // Wait for the window to be ready
      await this.page.waitForLoadState('domcontentloaded');
      console.log('✅ Connected to Electron window');
      
      // Give it a moment to fully load
      await this.page.waitForTimeout(2000);
      
      return true;
      
    } catch (error) {
      console.error('❌ Failed to connect to window:', error.message);
      console.log('\n📋 Make sure:');
      console.log('1. Khipu Studio is running');
      console.log('2. The window title shows "Vite + React + TS"');
      console.log('3. A project is loaded');
      return false;
    }
  }

  async captureScreenshot(filename, description = '') {
    try {
      const fullPath = path.join(this.screenshotDir, filename);
      
      console.log(`📸 [${this.screenshotIndex}] ${description || filename}`);
      
      // Wait for UI to settle
      await this.page.waitForTimeout(1000);
      
      // Take screenshot
      await this.page.screenshot({
        path: fullPath,
        type: 'png',
        fullPage: false
      });
      
      console.log(`   ✅ Saved: ${filename}`);
      this.screenshotIndex++;
      
    } catch (error) {
      console.error(`   ❌ Failed: ${filename} - ${error.message}`);
    }
  }

  async clickNavigation(moduleName) {
    console.log(`🧭 Navigating to ${moduleName}...`);
    
    try {
      // Try clicking by text content (most reliable for React apps)
      await this.page.click(`text=${moduleName}`, { timeout: 3000 });
      await this.page.waitForTimeout(1500);
      console.log(`   ✅ Clicked: ${moduleName}`);
      
    } catch (error) {
      console.log(`   ⚠️ Could not click ${moduleName}, trying alternatives...`);
      
      // Try different selectors
      const selectors = [
        `[aria-label*="${moduleName}"]`,
        `[title*="${moduleName}"]`,
        `a[href*="${moduleName.toLowerCase()}"]`,
        `button:has-text("${moduleName}")`,
        `*:has-text("${moduleName}"):visible`
      ];
      
      for (const selector of selectors) {
        try {
          await this.page.click(selector, { timeout: 2000 });
          await this.page.waitForTimeout(1500);
          console.log(`   ✅ Used selector: ${selector}`);
          return;
        } catch (e) {
          // Try next selector
        }
      }
      
      console.log(`   ❌ Could not navigate to ${moduleName}`);
    }
  }

  async runAutomatedCapture() {
    try {
      console.log('🚀 Starting Playwright Electron screenshot capture\n');
      
      await this.setupDirectories();
      
      if (!(await this.connectToWindow())) {
        throw new Error('Could not connect to Electron window');
      }
      
      console.log('⏳ Starting capture sequence...\n');
      
      // First capture the navigation
      await this.captureScreenshot('navigation/navigation-overview.png', 'Navigation bar overview');
      
      // Workflow sequence
      const workflow = [
        {
          module: 'Home',
          screenshots: [
            { file: 'workflow/01-home-new-project.png', desc: 'Home screen' },
            { file: 'workflow/01-home-recent-projects.png', desc: 'Recent projects area' }
          ]
        },
        {
          module: 'Book', 
          screenshots: [
            { file: 'workflow/02-book-metadata-form.png', desc: 'Book metadata form' }
          ]
        },
        {
          module: 'Manuscript',
          screenshots: [
            { file: 'workflow/03-manuscript-editor.png', desc: 'Manuscript editor' }
          ]
        },
        {
          module: 'Characters',
          screenshots: [
            { file: 'workflow/04-characters-tab.png', desc: 'Characters interface' },
            { file: 'workflow/04-characters-detection-start.png', desc: 'Character detection' }
          ]
        },
        {
          module: 'Casting',
          screenshots: [
            { file: 'workflow/05-casting-character-list.png', desc: 'Character casting' }
          ]
        },
        {
          module: 'Planning',
          screenshots: [
            { file: 'workflow/06-planning-auto-segments.png', desc: 'AI segments view' }
          ]
        },
        {
          module: 'Voice',
          screenshots: [
            { file: 'workflow/07-voice-generation-queue.png', desc: 'Voice generation' }
          ]
        },
        {
          module: 'Cost',
          screenshots: [
            { file: 'workflow/08-cost-tracking-dashboard.png', desc: 'Cost dashboard' }
          ]
        },
        {
          module: 'Packaging',
          screenshots: [
            { file: 'workflow/09-packaging-export-options.png', desc: 'Export options' }
          ]
        }
      ];

      for (const step of workflow) {
        console.log(`\n📋 Module: ${step.module}`);
        await this.clickNavigation(step.module);
        
        for (const screenshot of step.screenshots) {
          await this.captureScreenshot(screenshot.file, screenshot.desc);
          await this.page.waitForTimeout(500);
        }
      }
      
      console.log('\n🎉 Screenshot capture completed!');
      console.log(`📁 Screenshots saved to: ${this.screenshotDir}`);
      console.log(`📊 Total screenshots: ${this.screenshotIndex - 1}`);
      
    } catch (error) {
      console.error('\n❌ Capture failed:', error.message);
    } finally {
      // Don't close the app - leave it running
      console.log('🔄 Leaving app running...');
    }
  }

  async runInteractiveCapture() {
    console.log('🎮 Interactive capture mode\n');
    
    await this.setupDirectories();
    
    if (!(await this.connectToWindow())) {
      return;
    }
    
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    console.log('📋 Commands:');
    console.log('  capture <filename> - Take screenshot');
    console.log('  nav <module> - Navigate to module');
    console.log('  exit - Exit\n');
    
    const prompt = () => {
      readline.question('> ', async (input) => {
        const [command, ...args] = input.trim().split(' ');
        
        switch (command.toLowerCase()) {
          case 'capture':
            if (args[0]) {
              const filename = args[0].includes('/') ? args[0] : `workflow/${args[0]}`;
              await this.captureScreenshot(filename, `Interactive: ${args[0]}`);
            }
            break;
          case 'nav':
            if (args[0]) {
              await this.clickNavigation(args[0]);
            }
            break;
          case 'exit':
            readline.close();
            console.log('👋 Exiting interactive mode');
            return;
          default:
            console.log('Commands: capture <file>, nav <module>, exit');
        }
        prompt();
      });
    };
    
    prompt();
  }
}

async function main() {
  const capture = new ElectronWindowCapture();
  const mode = process.argv[2] || 'auto';
  
  if (mode === 'interactive') {
    await capture.runInteractiveCapture();
  } else {
    await capture.runAutomatedCapture();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = ElectronWindowCapture;