const { _electron: electron, chromium } = require('playwright');
const path = require('path');
const fs = require('fs').promises;

async function captureProjectScreenshot() {
  let browser = null;
  let page = null;
  
  try {
    console.log('📸 Capturing Project Page Screenshot');
    console.log('=====================================');
    
    // Ensure output directory exists
    const screenshotDir = path.join(__dirname, 'docs', 'images', 'user-guide', 'es-PE');
    await fs.mkdir(screenshotDir, { recursive: true });
    
    console.log('🔗 Connecting to running Khipu Studio...');
    
    // Try to connect via CDP first
    try {
      browser = await chromium.connectOverCDP('http://localhost:9222');
      const contexts = browser.contexts();
      
      if (contexts.length > 0) {
        const pages = contexts[0].pages();
        if (pages.length > 0) {
          page = pages[0];
          console.log('✅ Connected via CDP');
        }
      }
    } catch (cdpError) {
      console.log('⚠️ CDP connection failed, trying Electron launch...');
      
      // Fallback: launch new Electron instance
      const electronApp = await electron.launch({
        args: [path.join(__dirname, 'app')],
        headless: false
      });
      
      page = await electronApp.firstWindow();
      console.log('✅ Connected via new Electron instance');
    }
    
    if (!page) {
      throw new Error('Could not connect to Khipu Studio');
    }
    
    // Wait for app to load
    await page.waitForTimeout(2000);
    
    // Navigate to project page
    console.log('🧭 Navigating to Project page...');
    
    // Try to click on Project navigation item
    const projectNavSelector = 'a[href="/project"], nav a:has-text("Proyecto"), [data-testid="nav-project"]';
    
    try {
      // Wait for navigation to be available
      await page.waitForTimeout(1000);
      
      // Try multiple selectors to find the project navigation
      const navItem = await page.locator('a[href="/project"]').first();
      if (await navItem.count() > 0) {
        await navItem.click();
        console.log('✅ Clicked Project navigation via href');
      } else {
        // Alternative: try to navigate directly via URL
        const currentUrl = page.url();
        const baseUrl = currentUrl.replace(/\/[^\/]*$/, '');
        await page.goto(`${baseUrl}/project`);
        console.log('✅ Navigated to Project page via URL');
      }
    } catch (navError) {
      console.log('⚠️ Navigation attempt failed, trying direct URL...');
      await page.goto('http://localhost:5173/project');
    }
    
    // Wait for project page to load
    await page.waitForTimeout(2000);
    
    // Wait for main content to be visible
    await page.waitForSelector('main, [role="main"], .project-content', { timeout: 5000 });
    
    // Capture screenshot
    const screenshotPath = path.join(screenshotDir, '03-project.png');
    
    console.log('📸 Capturing Project page screenshot...');
    await page.screenshot({
      path: screenshotPath,
      type: 'png',
      fullPage: false // Capture viewport only
    });
    
    console.log(`✅ Screenshot saved: ${screenshotPath}`);
    console.log('🎉 Project page screenshot captured successfully!');
    
  } catch (error) {
    console.error('❌ Failed to capture screenshot:', error.message);
    
    console.log('\n📋 Troubleshooting:');
    console.log('1. Make sure Khipu Studio is running (npm run dev in app directory)');
    console.log('2. Ensure you have a project loaded');
    console.log('3. Check if the app is accessible at http://localhost:5173');
    console.log('4. Try launching with: node launch-app-for-capture.js');
    
    process.exit(1);
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }
}

// Run if called directly
if (require.main === module) {
  captureProjectScreenshot();
}

module.exports = { captureProjectScreenshot };