const { _electron: electron } = require('playwright');
const path = require('path');

class ElectronAppLauncher {
  constructor() {
    this.app = null;
  }

  async launchWithDebugging() {
    console.log('🚀 Launching Khipu Studio with remote debugging enabled...');
    
    try {
      this.app = await electron.launch({
        args: [
          path.join(__dirname, 'app'),
          '--remote-debugging-port=9222',
          '--enable-logging',
          '--v=1'
        ],
        headless: false,
        env: {
          ...process.env,
          NODE_ENV: 'development'
        }
      });

      const page = await this.app.firstWindow();
      
      console.log('✅ App launched successfully with remote debugging');
      console.log('🔗 Remote debugging available at: http://localhost:9222');
      console.log('📋 You can now run: node capture-playwright-running-app.js');
      
      // Wait for the app to fully load
      await page.waitForLoadState('domcontentloaded');
      
      // Check if project needs to be loaded
      await this.checkProjectStatus(page);
      
      return { app: this.app, page };
      
    } catch (error) {
      console.error('❌ Failed to launch app with debugging:', error.message);
      throw error;
    }
  }

  async checkProjectStatus(page) {
    try {
      // Check if we're on the home screen (no project loaded)
      const isHomePage = await page.locator('[data-testid="home-screen"], .home-page').count() > 0;
      
      if (isHomePage) {
        console.log('📂 App is on home screen - you may need to load a project');
        console.log('💡 Suggestion: Load the "puntajada" test project for consistent screenshots');
      } else {
        console.log('✅ Project appears to be loaded');
      }
      
    } catch (error) {
      console.log('⚠️ Could not determine project status:', error.message);
    }
  }

  async keepAlive() {
    console.log('\n🔄 App is running and ready for screenshot capture');
    console.log('🎯 Press Ctrl+C to close the app when done\n');
    
    // Keep the process alive
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', process.exit.bind(process, 0));
  }
}

async function main() {
  const launcher = new ElectronAppLauncher();
  
  try {
    await launcher.launchWithDebugging();
    await launcher.keepAlive();
    
  } catch (error) {
    console.error('Failed to launch app:', error);
    process.exit(1);
  }
}

// Handle cleanup
process.on('SIGINT', async () => {
  console.log('\n👋 Closing Khipu Studio...');
  process.exit(0);
});

if (require.main === module) {
  main().catch(console.error);
}

module.exports = ElectronAppLauncher;