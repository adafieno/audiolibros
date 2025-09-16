const puppeteer = require('puppeteer');
const path = require('path');

async function captureSimpleScreenshot() {
  console.log('🚀 Starting simple screenshot test...');
  
  const browser = await puppeteer.launch({ headless: false, devtools: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 800 });
  
  try {
    console.log('📝 Navigating to http://localhost:5173/');
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });
    
    // Wait a bit for React to render
    await new Promise(resolve => setTimeout(resolve, 3000));
    console.log('📸 Taking screenshot...');
    
    await page.screenshot({ path: 'screenshots/simple-test.png', fullPage: true });
    console.log('✅ Screenshot saved to screenshots/simple-test.png');
    
    // Check what's on the page
    const pageTitle = await page.title();
    console.log('📄 Page title:', pageTitle);
    
    const bodyText = await page.evaluate(() => document.body.textContent?.substring(0, 200));
    console.log('📄 Page content preview:', bodyText);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

captureSimpleScreenshot().catch(console.error);