const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs').promises;

class SimpleAppCapture {
  constructor() {
    this.screenshotDir = path.join(__dirname, 'docs', 'images', 'user-guide');
    this.browser = null;
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

  async connectToApp() {
    try {
      console.log('🔗 Connecting to Khipu Studio...');
      
      // Launch browser and navigate to localhost
      this.browser = await chromium.launch({ headless: false });
      const context = await this.browser.newContext();
      this.page = await context.newPage();
      
      // Try common Electron dev server ports
      const ports = [5173, 3000, 8080, 4000];
      let connected = false;
      
      for (const port of ports) {
        try {
          await this.page.goto(`http://localhost:${port}`, { waitUntil: 'networkidle' });
          
          // Check if this looks like our app
          const title = await this.page.title();
          if (title.includes('Khipu') || title.includes('Studio')) {
            console.log(`✅ Connected to app on port ${port}`);
            connected = true;
            break;
          }
        } catch (error) {
          // Try next port
          continue;
        }
      }
      
      if (!connected) {
        throw new Error('Could not connect to running app on common ports');
      }
      
      // Wait for app to be ready
      await this.page.waitForTimeout(2000);
      
    } catch (error) {
      console.error('❌ Failed to connect:', error.message);
      console.log('\n📋 Instructions:');
      console.log('1. Make sure Khipu Studio is running in development mode');
      console.log('2. Check that it\'s accessible at http://localhost:5173 or similar');
      console.log('3. Ensure the app is fully loaded with a project');
      throw error;
    }
  }

  async captureScreenshot(filename, description = '') {
    try {
      const fullPath = path.join(this.screenshotDir, filename);
      
      console.log(`📸 [${this.screenshotIndex}] ${description || filename}`);
      
      // Wait for UI to settle
      await this.page.waitForTimeout(1500);
      
      // Take screenshot
      await this.page.screenshot({
        path: fullPath,
        type: 'png',
        fullPage: false // Capture visible viewport
      });
      
      console.log(`   ✅ Saved: ${filename}`);
      this.screenshotIndex++;
      
    } catch (error) {
      console.error(`   ❌ Failed: ${filename} - ${error.message}`);
    }
  }

  async navigateToModule(moduleName) {
    console.log(`🧭 Navigating to ${moduleName}...`);
    
    try {
      // Try multiple selector strategies for navigation
      const selectors = [
        `[data-testid="nav-${moduleName.toLowerCase()}"]`,
        `[aria-label*="${moduleName}"]`,
        `[title*="${moduleName}"]`,
        `text=${moduleName}`,
        `a[href*="${moduleName.toLowerCase()}"]`
      ];
      
      let clicked = false;
      
      for (const selector of selectors) {
        try {
          const element = await this.page.waitForSelector(selector, { timeout: 2000 });
          if (element) {
            await element.click();
            await this.page.waitForTimeout(2000);
            console.log(`   ✅ Navigated using: ${selector}`);
            clicked = true;
            break;
          }
        } catch (err) {
          // Continue to next selector
        }
      }
      
      if (!clicked) {
        // Final fallback: try keyboard shortcuts
        await this.tryKeyboardNavigation(moduleName);
      }
      
    } catch (error) {
      console.error(`   ❌ Failed to navigate to ${moduleName}: ${error.message}`);
    }
  }

  async tryKeyboardNavigation(moduleName) {
    const keyMap = {
      'Home': 'Digit1', 'Book': 'Digit2', 'Manuscript': 'Digit3', 
      'Characters': 'Digit4', 'Casting': 'Digit5', 'Planning': 'Digit6',
      'Voice': 'Digit7', 'Cost': 'Digit8', 'Packaging': 'Digit9', 
      'Settings': 'Digit0'
    };
    
    if (keyMap[moduleName]) {
      console.log(`   ⌨️ Trying keyboard: Alt+${keyMap[moduleName]}`);
      await this.page.keyboard.press(`Alt+${keyMap[moduleName]}`);
      await this.page.waitForTimeout(1500);
    }
  }

  async captureWorkflowSequence() {
    console.log('\n🎬 Starting workflow screenshot sequence...');
    
    const workflow = [
      {
        module: 'Home',
        screenshots: [
          { file: 'workflow/01-home-new-project.png', desc: 'Home screen - New Project button' },
          { file: 'workflow/01-home-recent-projects.png', desc: 'Home screen - Recent projects list' }
        ]
      },
      {
        module: 'Book', 
        screenshots: [
          { file: 'workflow/02-book-metadata-form.png', desc: 'Book metadata form' },
          { file: 'workflow/02-book-cover-upload.png', desc: 'Book cover upload interface' }
        ]
      },
      {
        module: 'Manuscript',
        screenshots: [
          { file: 'workflow/03-manuscript-import-options.png', desc: 'Manuscript import options' },
          { file: 'workflow/03-manuscript-editor.png', desc: 'Manuscript editor' }
        ]
      },
      {
        module: 'Characters',
        screenshots: [
          { file: 'workflow/04-characters-tab.png', desc: 'Characters tab interface' },
          { file: 'workflow/04-characters-detection-start.png', desc: 'Character detection button' },
          { file: 'workflow/04-characters-detected-list.png', desc: 'Detected characters list' }
        ]
      },
      {
        module: 'Casting',
        screenshots: [
          { file: 'workflow/05-casting-character-list.png', desc: 'Character casting interface' },
          { file: 'workflow/05-casting-voice-selection.png', desc: 'Voice selection panel' }
        ]
      },
      {
        module: 'Planning',
        screenshots: [
          { file: 'workflow/06-planning-auto-segments.png', desc: 'AI-generated segments view' },
          { file: 'workflow/06-planning-segment-details.png', desc: 'Individual segment details' }
        ]
      },
      {
        module: 'Voice',
        screenshots: [
          { file: 'workflow/07-voice-generation-queue.png', desc: 'Voice generation queue' },
          { file: 'workflow/07-voice-preview-player.png', desc: 'Audio preview player' }
        ]
      },
      {
        module: 'Cost',
        screenshots: [
          { file: 'workflow/08-cost-tracking-dashboard.png', desc: 'Cost tracking dashboard' }
        ]
      },
      {
        module: 'Packaging',
        screenshots: [
          { file: 'workflow/09-packaging-export-options.png', desc: 'Export options interface' }
        ]
      }
    ];

    // First capture navigation overview
    await this.captureScreenshot('navigation/navigation-overview.png', 'Main navigation bar');

    // Then go through each module
    for (const step of workflow) {
      console.log(`\n📋 Capturing: ${step.module} module`);
      await this.navigateToModule(step.module);
      
      for (const screenshot of step.screenshots) {
        await this.captureScreenshot(screenshot.file, screenshot.desc);
        await this.page.waitForTimeout(800); // Brief pause between screenshots
      }
    }
  }

  async runCapture() {
    try {
      console.log('🚀 Starting simple screenshot capture\n');
      
      await this.setupDirectories();
      await this.connectToApp();
      
      console.log('⏳ Waiting for app to be ready...');
      await this.page.waitForTimeout(3000);
      
      await this.captureWorkflowSequence();
      
      console.log('\n🎉 Screenshot capture completed!');
      console.log(`📁 Screenshots saved to: ${this.screenshotDir}`);
      console.log(`📊 Total screenshots: ${this.screenshotIndex - 1}`);
      
    } catch (error) {
      console.error('\n❌ Capture failed:', error.message);
    } finally {
      if (this.browser) {
        await this.browser.close();
      }
    }
  }

  async interactiveMode() {
    await this.setupDirectories();
    await this.connectToApp();
    
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    console.log('\n🎮 Interactive Mode Commands:');
    console.log('  capture <filename> - Take screenshot');
    console.log('  nav <module> - Navigate to module');
    console.log('  exit - Exit\n');
    
    const prompt = () => {
      readline.question('> ', async (input) => {
        const [command, ...args] = input.trim().split(' ');
        
        switch (command.toLowerCase()) {
          case 'capture':
            if (args[0]) {
              await this.captureScreenshot(`workflow/${args[0]}`, `Manual: ${args[0]}`);
            }
            break;
          case 'nav':
            if (args[0]) {
              await this.navigateToModule(args[0]);
            }
            break;
          case 'exit':
            readline.close();
            if (this.browser) await this.browser.close();
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
  const capture = new SimpleAppCapture();
  const mode = process.argv[2] || 'auto';
  
  if (mode === 'interactive') {
    await capture.interactiveMode();
  } else {
    await capture.runCapture();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = SimpleAppCapture;