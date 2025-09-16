const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs').promises;

class PlaywrightElectronCapture {
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

  async connectToRunningApp() {
    try {
      console.log('🔗 Attempting to connect to running Khipu Studio app...');
      
      // Try to connect to existing Electron app
      // This assumes the app is running on default debugging port
      this.app = await electron.launch({
        args: ['--remote-debugging-port=9222'],
        headless: false,
        // Connect to existing process instead of launching new one
        executablePath: undefined
      });

      // Alternative: Connect via CDP (Chrome DevTools Protocol)
      const { chromium } = require('playwright');
      const browser = await chromium.connectOverCDP('http://localhost:9222');
      const contexts = browser.contexts();
      
      if (contexts.length === 0) {
        throw new Error('No Electron contexts found. Make sure Khipu Studio is running with --remote-debugging-port=9222');
      }

      const context = contexts[0];
      const pages = context.pages();
      
      if (pages.length === 0) {
        throw new Error('No pages found in Electron app');
      }

      this.page = pages[0];
      console.log('✅ Connected to running Khipu Studio app');
      
      // Wait for app to be ready
      await this.page.waitForSelector('[data-testid="app-shell"]', { timeout: 5000 });
      
    } catch (error) {
      console.log('⚠️ Could not connect via CDP, trying alternative approach...');
      await this.connectAlternative();
    }
  }

  async connectAlternative() {
    try {
      // Alternative: Launch Playwright but connect to existing window
      this.app = await electron.launch({
        args: [
          path.join(__dirname, 'app'),
          '--remote-debugging-port=9222'
        ],
        headless: false
      });

      this.page = await this.app.firstWindow();
      console.log('✅ Connected using alternative method');
      
      // Wait for the app to load
      await this.page.waitForLoadState('domcontentloaded');
      
    } catch (error) {
      console.error('❌ Failed to connect to Electron app:', error.message);
      console.log('\n📋 Instructions:');
      console.log('1. Make sure Khipu Studio is running');
      console.log('2. Restart the app with: npm run dev -- --remote-debugging-port=9222');
      console.log('3. Or modify the Electron main process to enable remote debugging');
      throw error;
    }
  }

  async captureScreenshot(filename, selector = null, description = '') {
    try {
      const fullPath = path.join(this.screenshotDir, filename);
      
      console.log(`📸 Capturing: ${description || filename}`);
      
      // Wait a moment for UI to settle
      await this.page.waitForTimeout(1000);
      
      if (selector) {
        // Capture specific element
        const element = await this.page.waitForSelector(selector, { timeout: 5000 });
        await element.screenshot({ 
          path: fullPath,
          type: 'png'
        });
      } else {
        // Capture full window
        await this.page.screenshot({ 
          path: fullPath,
          type: 'png',
          fullPage: false  // Capture visible viewport only
        });
      }
      
      console.log(`✅ Screenshot saved: ${filename}`);
      this.screenshotIndex++;
      
    } catch (error) {
      console.error(`❌ Failed to capture ${filename}:`, error.message);
    }
  }

  async navigateToTab(tabName) {
    try {
      console.log(`🧭 Navigating to ${tabName} tab...`);
      
      // Click on navigation tab
      const tabSelector = `[data-testid="nav-${tabName.toLowerCase()}"], [data-tab="${tabName.toLowerCase()}"], [aria-label*="${tabName}"]`;
      
      await this.page.click(tabSelector);
      await this.page.waitForTimeout(1500); // Wait for tab to load
      
      console.log(`✅ Navigated to ${tabName} tab`);
      
    } catch (error) {
      console.error(`❌ Failed to navigate to ${tabName}:`, error.message);
      
      // Fallback: try keyboard navigation
      await this.navigateByKeyboard(tabName);
    }
  }

  async navigateByKeyboard(tabName) {
    console.log(`⌨️ Trying keyboard navigation for ${tabName}...`);
    
    const tabKeys = {
      'Home': 'Digit1',
      'Book': 'Digit2', 
      'Manuscript': 'Digit3',
      'Characters': 'Digit4',
      'Casting': 'Digit5',
      'Planning': 'Digit6',
      'Voice': 'Digit7',
      'Cost': 'Digit8',
      'Packaging': 'Digit9',
      'Settings': 'Digit0'
    };
    
    if (tabKeys[tabName]) {
      // Use Ctrl+Number for tab navigation (common pattern)
      await this.page.keyboard.press(`Control+${tabKeys[tabName]}`);
      await this.page.waitForTimeout(1000);
    }
  }

  async captureWorkflowScreenshots() {
    console.log('🎬 Starting workflow screenshot capture...');
    
    const workflowSteps = [
      {
        tab: 'Home',
        screenshots: [
          { file: 'workflow/01-home-new-project.png', description: 'Home screen with New Project button' },
          { file: 'workflow/01-home-recent-projects.png', description: 'Recent projects list' }
        ]
      },
      {
        tab: 'Book',
        screenshots: [
          { file: 'workflow/02-book-metadata-form.png', description: 'Book metadata form' },
          { file: 'workflow/02-book-cover-upload.png', description: 'Cover upload interface' }
        ]
      },
      {
        tab: 'Manuscript',
        screenshots: [
          { file: 'workflow/03-manuscript-import-options.png', description: 'Manuscript import options' },
          { file: 'workflow/03-manuscript-editor.png', description: 'Manuscript editor' }
        ]
      },
      {
        tab: 'Characters',
        screenshots: [
          { file: 'workflow/04-characters-tab.png', description: 'Characters tab interface' },
          { file: 'workflow/04-characters-detection-start.png', description: 'Character detection button' },
          { file: 'workflow/04-characters-detected-list.png', description: 'Detected characters list' }
        ]
      },
      {
        tab: 'Casting',
        screenshots: [
          { file: 'workflow/05-casting-character-list.png', description: 'Character casting list' },
          { file: 'workflow/05-casting-voice-selection.png', description: 'Voice selection interface' }
        ]
      },
      {
        tab: 'Planning',
        screenshots: [
          { file: 'workflow/06-planning-auto-segments.png', description: 'Auto-generated segments' },
          { file: 'workflow/06-planning-segment-details.png', description: 'Segment details view' }
        ]
      },
      {
        tab: 'Voice',
        screenshots: [
          { file: 'workflow/07-voice-generation-queue.png', description: 'Voice generation queue' },
          { file: 'workflow/07-voice-preview-player.png', description: 'Audio preview player' }
        ]
      },
      {
        tab: 'Cost',
        screenshots: [
          { file: 'workflow/08-cost-tracking-dashboard.png', description: 'Cost tracking dashboard' }
        ]
      },
      {
        tab: 'Packaging',
        screenshots: [
          { file: 'workflow/09-packaging-export-options.png', description: 'Export options' }
        ]
      }
    ];

    for (const step of workflowSteps) {
      await this.navigateToTab(step.tab);
      
      for (const screenshot of step.screenshots) {
        await this.captureScreenshot(screenshot.file, null, screenshot.description);
        
        // Small delay between screenshots
        await this.page.waitForTimeout(500);
      }
    }
  }

  async captureNavigationScreenshots() {
    console.log('🧭 Capturing navigation screenshots...');
    
    await this.captureScreenshot(
      'navigation/navigation-overview.png',
      '[data-testid="navigation-bar"], nav, .navigation',
      'Main navigation bar'
    );
  }

  async runFullCapture() {
    try {
      console.log('🚀 Starting Playwright Electron screenshot capture...');
      console.log('📋 Assuming app is running with project loaded\n');
      
      await this.setupDirectories();
      await this.connectToRunningApp();
      
      // Capture navigation first
      await this.captureNavigationScreenshots();
      
      // Capture workflow screenshots
      await this.captureWorkflowScreenshots();
      
      console.log('\n✅ Screenshot capture completed!');
      console.log(`📁 Screenshots saved to: ${this.screenshotDir}`);
      
    } catch (error) {
      console.error('❌ Screenshot capture failed:', error.message);
    } finally {
      if (this.app) {
        console.log('🔄 Leaving app running (not closing)...');
        // Don't close the app - leave it running
      }
    }
  }

  async interactiveMode() {
    console.log('🎮 Starting interactive mode...');
    console.log('Use this mode to manually navigate and capture specific screenshots\n');
    
    await this.setupDirectories();
    await this.connectToRunningApp();
    
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const prompt = () => {
      readline.question('\n📸 Enter screenshot filename (or "exit"): ', async (filename) => {
        if (filename.toLowerCase() === 'exit') {
          readline.close();
          return;
        }
        
        if (filename) {
          await this.captureScreenshot(`workflow/${filename}`);
        }
        
        prompt();
      });
    };
    
    console.log('Navigate the app manually, then enter filenames to capture screenshots');
    prompt();
  }
}

// Command line interface
async function main() {
  const capture = new PlaywrightElectronCapture();
  
  const mode = process.argv[2];
  
  switch (mode) {
    case 'interactive':
    case 'manual':
      await capture.interactiveMode();
      break;
    case 'auto':
    default:
      await capture.runFullCapture();
      break;
  }
}

// Handle cleanup
process.on('SIGINT', () => {
  console.log('\n👋 Exiting gracefully...');
  process.exit(0);
});

if (require.main === module) {
  main().catch(console.error);
}

module.exports = PlaywrightElectronCapture;