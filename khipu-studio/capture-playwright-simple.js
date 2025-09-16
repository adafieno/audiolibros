const { _electron: electron, chromium } = require('playwright');
const path = require('path');
const fs = require('fs').promises;

class PlaywrightRunningAppCapture {
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

  async connectToElectronApp() {
    try {
      console.log('🔗 Connecting to running Khipu Studio...');
      
      // Method 1: Try to connect via CDP endpoint
      try {
        this.browser = await chromium.connectOverCDP('http://localhost:9222');
        const contexts = this.browser.contexts();
        
        if (contexts.length > 0) {
          const pages = contexts[0].pages();
          if (pages.length > 0) {
            this.page = pages[0];
            console.log('✅ Connected via CDP (Chrome DevTools Protocol)');
            return;
          }
        }
      } catch (cdpError) {
        console.log('⚠️ CDP connection failed, trying alternative...');
      }

      // Method 2: Launch new Playwright instance pointing to app directory
      const electronApp = await electron.launch({
        args: [path.join(__dirname, 'app')],
        headless: false
      });

      this.page = await electronApp.firstWindow();
      console.log('✅ Connected via new Electron instance');
      
      // Wait for app to load
      await this.page.waitForTimeout(3000);
      
    } catch (error) {
      console.error('❌ Failed to connect to Electron app:', error.message);
      console.log('\n📋 Troubleshooting:');
      console.log('1. Make sure Khipu Studio is running');
      console.log('2. Try running: node launch-app-for-capture.js first');
      console.log('3. Or start your app with --remote-debugging-port=9222');
      throw error;
    }
  }

  async waitForElement(selector, timeout = 5000) {
    try {
      await this.page.waitForSelector(selector, { timeout });
      return true;
    } catch (error) {
      console.log(`⚠️ Element not found: ${selector}`);
      return false;
    }
  }

  async captureScreenshot(filename, description = '', selector = null) {
    try {
      const fullPath = path.join(this.screenshotDir, filename);
      
      console.log(`📸 [${this.screenshotIndex}] ${description || filename}`);
      
      // Wait for UI to settle
      await this.page.waitForTimeout(1000);
      
      const screenshotOptions = {
        path: fullPath,
        type: 'png'
      };

      if (selector) {
        // Try to capture specific element
        const element = await this.page.$(selector);
        if (element) {
          await element.screenshot(screenshotOptions);
        } else {
          // Fallback to full page
          await this.page.screenshot({...screenshotOptions, fullPage: false});
        }
      } else {
        // Capture viewport
        await this.page.screenshot({...screenshotOptions, fullPage: false});
      }
      
      console.log(`   ✅ Saved: ${filename}`);
      this.screenshotIndex++;
      
    } catch (error) {
      console.error(`   ❌ Failed: ${filename} - ${error.message}`);
    }
  }

  async navigateToModule(moduleName) {
    const moduleSelectors = {
      'Home': '[data-testid="nav-home"], [aria-label*="Home"], button[title*="Home"]',
      'Book': '[data-testid="nav-book"], [aria-label*="Book"], button[title*="Book"]', 
      'Manuscript': '[data-testid="nav-manuscript"], [aria-label*="Manuscript"], button[title*="Manuscript"]',
      'Characters': '[data-testid="nav-characters"], [aria-label*="Characters"], button[title*="Characters"]',
      'Casting': '[data-testid="nav-casting"], [aria-label*="Casting"], button[title*="Casting"]',
      'Planning': '[data-testid="nav-planning"], [aria-label*="Planning"], button[title*="Planning"]',
      'Voice': '[data-testid="nav-voice"], [aria-label*="Voice"], button[title*="Voice"]',
      'Cost': '[data-testid="nav-cost"], [aria-label*="Cost"], button[title*="Cost"]',
      'Packaging': '[data-testid="nav-packaging"], [aria-label*="Packaging"], button[title*="Packaging"]',
      'Settings': '[data-testid="nav-settings"], [aria-label*="Settings"], button[title*="Settings"]'
    };

    console.log(`🧭 Navigating to ${moduleName}...`);
    
    try {
      const selector = moduleSelectors[moduleName];
      if (!selector) {
        throw new Error(`Unknown module: ${moduleName}`);
      }

      // Try multiple selection strategies
      const strategies = selector.split(', ');
      
      for (const strategy of strategies) {
        try {
          const element = await this.page.$(strategy);
          if (element) {
            await element.click();
            await this.page.waitForTimeout(2000); // Wait for navigation
            console.log(`   ✅ Clicked: ${strategy}`);
            return;
          }
        } catch (err) {
          // Continue to next strategy
        }
      }
      
      // Fallback: try text-based selection
      await this.page.click(`text=${moduleName}`);
      await this.page.waitForTimeout(2000);
      console.log(`   ✅ Used text selector for ${moduleName}`);
      
    } catch (error) {
      console.error(`   ❌ Failed to navigate to ${moduleName}: ${error.message}`);
      
      // Final fallback: keyboard shortcuts
      await this.tryKeyboardNavigation(moduleName);
    }
  }

  async tryKeyboardNavigation(moduleName) {
    const keyMap = {
      'Home': '1', 'Book': '2', 'Manuscript': '3', 'Characters': '4', 'Casting': '5',
      'Planning': '6', 'Voice': '7', 'Cost': '8', 'Packaging': '9', 'Settings': '0'
    };
    
    if (keyMap[moduleName]) {
      console.log(`   ⌨️ Trying keyboard shortcut: Alt+${keyMap[moduleName]}`);
      await this.page.keyboard.press(`Alt+${keyMap[moduleName]}`);
      await this.page.waitForTimeout(1500);
    }
  }

  async captureWorkflowSequence() {
    console.log('\n🎬 Starting automated workflow capture...');
    
    const workflow = [
      {
        module: 'Home',
        screenshots: [
          { file: 'workflow/01-home-new-project.png', desc: 'Home screen - New Project' },
          { file: 'workflow/01-home-recent-projects.png', desc: 'Home screen - Recent Projects' }
        ]
      },
      {
        module: 'Book', 
        screenshots: [
          { file: 'workflow/02-book-metadata-form.png', desc: 'Book metadata form' },
          { file: 'workflow/02-book-cover-upload.png', desc: 'Book cover upload' }
        ]
      },
      {
        module: 'Manuscript',
        screenshots: [
          { file: 'workflow/03-manuscript-import-options.png', desc: 'Manuscript import options' },
          { file: 'workflow/03-manuscript-editor.png', desc: 'Manuscript editor interface' }
        ]
      },
      {
        module: 'Characters',
        screenshots: [
          { file: 'workflow/04-characters-tab.png', desc: 'Characters tab main view' },
          { file: 'workflow/04-characters-detection-start.png', desc: 'Character detection interface' },
          { file: 'workflow/04-characters-detected-list.png', desc: 'Detected characters list' }
        ]
      },
      {
        module: 'Casting',
        screenshots: [
          { file: 'workflow/05-casting-character-list.png', desc: 'Character casting list' },
          { file: 'workflow/05-casting-voice-selection.png', desc: 'Voice selection interface' }
        ]
      },
      {
        module: 'Planning',
        screenshots: [
          { file: 'workflow/06-planning-auto-segments.png', desc: 'Auto-generated segments' },
          { file: 'workflow/06-planning-segment-details.png', desc: 'Segment details view' }
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

    for (const step of workflow) {
      console.log(`\n📋 Module: ${step.module}`);
      await this.navigateToModule(step.module);
      
      for (const screenshot of step.screenshots) {
        await this.captureScreenshot(screenshot.file, screenshot.desc);
        await this.page.waitForTimeout(500); // Brief pause between screenshots
      }
    }
  }

  async captureNavigationBar() {
    console.log('\n🧭 Capturing navigation elements...');
    await this.captureScreenshot(
      'navigation/navigation-overview.png', 
      'Main navigation bar overview'
    );
  }

  async runAutomatedCapture() {
    try {
      console.log('🚀 Starting Playwright screenshot capture for running app\n');
      
      await this.setupDirectories();
      await this.connectToElectronApp();
      
      // Give user a moment to ensure app is ready
      console.log('⏳ Waiting 3 seconds for app to be ready...');
      await this.page.waitForTimeout(3000);
      
      // Capture navigation first
      await this.captureNavigationBar();
      
      // Capture workflow screenshots
      await this.captureWorkflowSequence();
      
      console.log('\n🎉 Screenshot capture completed successfully!');
      console.log(`📁 Screenshots saved to: ${this.screenshotDir}`);
      console.log(`📊 Total screenshots captured: ${this.screenshotIndex - 1}`);
      
    } catch (error) {
      console.error('\n❌ Screenshot capture failed:', error.message);
      throw error;
    }
  }

  async interactiveCapture() {
    console.log('🎮 Interactive capture mode\n');
    
    await this.setupDirectories();
    await this.connectToElectronApp();
    
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    console.log('📋 Commands:');
    console.log('  capture <filename> - Take screenshot');
    console.log('  nav <module> - Navigate to module');
    console.log('  exit - Exit interactive mode\n');
    
    const promptUser = () => {
      readline.question('> ', async (input) => {
        const [command, ...args] = input.trim().split(' ');
        
        switch (command.toLowerCase()) {
          case 'capture':
            if (args[0]) {
              await this.captureScreenshot(`workflow/${args[0]}`, `Interactive: ${args[0]}`);
            } else {
              console.log('Usage: capture <filename>');
            }
            break;
            
          case 'nav':
            if (args[0]) {
              await this.navigateToModule(args[0]);
            } else {
              console.log('Usage: nav <module>');
            }
            break;
            
          case 'exit':
            readline.close();
            return;
            
          default:
            console.log('Unknown command. Use: capture, nav, or exit');
        }
        
        promptUser();
      });
    };
    
    promptUser();
  }
}

async function main() {
  const capture = new PlaywrightRunningAppCapture();
  
  const mode = process.argv[2] || 'auto';
  
  try {
    switch (mode) {
      case 'interactive':
      case 'manual':
        await capture.interactiveCapture();
        break;
      case 'auto':
      default:
        await capture.runAutomatedCapture();
        break;
    }
  } catch (error) {
    console.error('Script failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = PlaywrightRunningAppCapture;