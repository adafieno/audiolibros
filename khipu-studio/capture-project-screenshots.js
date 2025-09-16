const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs').promises;

// Language configurations
const LANGUAGE_CONFIGS = [
  {
    name: 'English (US)',
    language: 'en-US',
    screenshotPrefix: 'with-project-en-us'
  },
  {
    name: 'Español (Perú)', 
    language: 'es-PE',
    screenshotPrefix: 'with-project-es-pe'
  },
  {
    name: 'Português (Brasil)',
    language: 'pt-BR', 
    screenshotPrefix: 'with-project-pt-br'
  }
];

async function captureWithProject(config) {
  console.log(`🌐 Capturing project screenshots for ${config.name}...`);
  
  const screenshotsDir = path.join(__dirname, 'screenshots', config.screenshotPrefix);
  await fs.mkdir(screenshotsDir, { recursive: true });
  
  const browser = await puppeteer.launch({ 
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  
  try {
    // Navigate to app
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });
    
    // Apply dark theme
    console.log(`🌙 Setting dark theme for ${config.name}...`);
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    
    // Set language
    console.log(`🌐 Setting language to ${config.language}...`);
    await page.evaluate((lang) => {
      localStorage.setItem('khipu.lang', lang);
    }, config.language);
    
    // Reload to apply changes
    await page.reload({ waitUntil: 'networkidle2' });
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('');
    console.log('⚠️  MANUAL STEP REQUIRED:');
    console.log('   1. In the browser window that opened:');
    console.log('   2. Click "Abrir proyecto existente" / "Open Existing Project"');
    console.log('   3. Navigate to: C:\\code\\audiolibros\\khipu-studio\\reference-code\\test_7');
    console.log('   4. Select the test_7 folder and open it');
    console.log('   5. Wait for the project to fully load (you should see sidebar tabs)');
    console.log('   6. Press ENTER in this terminal to continue...');
    console.log('');
    
    // Wait for user input
    await new Promise((resolve) => {
      process.stdin.once('data', () => resolve());
    });

    let screenshotIndex = 1;
    
    // Helper function
    async function takeScreenshot(name, description) {
      const filename = `${screenshotIndex.toString().padStart(2, '0')}-${name}.png`;
      const fullPath = path.join(screenshotsDir, filename);

      console.log(`📸 ${description}`);
      await page.screenshot({ path: fullPath, fullPage: true });
      console.log(`   ✅ Saved: ${filename}`);
      screenshotIndex++;
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    console.log('📂 Continuing with project-loaded screenshots...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // === PROJECT WORKFLOW SCREENSHOTS ===
    console.log('📋 Project workflow screenshots');
    
    // 01. Home with project loaded
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });
    await new Promise(resolve => setTimeout(resolve, 2000));
    await takeScreenshot('home-with-project', 'Home screen with project loaded');
    
    // 02. Book configuration
    await page.goto('http://localhost:5173/book', { waitUntil: 'networkidle2' });
    await new Promise(resolve => setTimeout(resolve, 2000));
    await takeScreenshot('book-page', 'Book configuration page with data');
    
    // 03. Manuscript management
    await page.goto('http://localhost:5173/manuscript', { waitUntil: 'networkidle2' });
    await new Promise(resolve => setTimeout(resolve, 2000));
    await takeScreenshot('manuscript-page', 'Manuscript page with chapters');
    
    // 04. Dossier/Characters
    await page.goto('http://localhost:5173/dossier', { waitUntil: 'networkidle2' });
    await new Promise(resolve => setTimeout(resolve, 2000));
    await takeScreenshot('dossier-page', 'Character management page');
    
    // 05. Voice Casting
    await page.goto('http://localhost:5173/casting', { waitUntil: 'networkidle2' });
    await new Promise(resolve => setTimeout(resolve, 2000));
    await takeScreenshot('casting-page', 'Voice casting page');
    
    // 06. Planning
    await page.goto('http://localhost:5173/planning', { waitUntil: 'networkidle2' });
    await new Promise(resolve => setTimeout(resolve, 2000));
    await takeScreenshot('planning-page', 'Content planning page');
    
    // 07. Voice/Audio production
    await page.goto('http://localhost:5173/voice', { waitUntil: 'networkidle2' });
    await new Promise(resolve => setTimeout(resolve, 2000));
    await takeScreenshot('voice-page', 'Audio production page');
    
    // 08. Packaging
    await page.goto('http://localhost:5173/packaging', { waitUntil: 'networkidle2' });
    await new Promise(resolve => setTimeout(resolve, 2000));
    await takeScreenshot('packaging-page', 'Export and packaging page');
    
    // 09. Settings
    await page.goto('http://localhost:5173/settings', { waitUntil: 'networkidle2' });
    await new Promise(resolve => setTimeout(resolve, 2000));
    await takeScreenshot('settings-page', 'Settings page');

    console.log(`✅ ${config.name} project screenshots completed!`);
    
  } catch (error) {
    console.error(`❌ Error for ${config.name}:`, error.message);
    console.error(error.stack);
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log('🚀 Starting project-loaded screenshot capture...');
  console.log('📚 This captures screenshots with real project data');
  console.log('⚠️  Requires manual project opening for each language');
  
  for (const config of LANGUAGE_CONFIGS) {
    await captureWithProject(config);
    
    if (config !== LANGUAGE_CONFIGS[LANGUAGE_CONFIGS.length - 1]) {
      console.log('');
      console.log('🔄 Prepare for next language...');
      console.log('   Close any open projects and return to home screen before continuing');
      console.log('   Press ENTER when ready for the next language...');
      await new Promise((resolve) => {
        process.stdin.once('data', () => resolve());
      });
    }
  }
  
  console.log('🎉 All project screenshots completed!');
  console.log('📂 Screenshots saved in: screenshots/with-project-[language]/');
}

main().catch(console.error);