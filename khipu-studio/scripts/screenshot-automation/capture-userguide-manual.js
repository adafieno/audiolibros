const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs').promises;

// Language configurations
const LANGUAGE_CONFIGS = [
  {
    name: 'English (US)',
    language: 'en-US',
    screenshotPrefix: 'user-guide-en-us'
  },
  {
    name: 'Español (Perú)', 
    language: 'es-PE',
    screenshotPrefix: 'user-guide-es-pe'
  },
  {
    name: 'Português (Brasil)',
    language: 'pt-BR', 
    screenshotPrefix: 'user-guide-pt-br'
  }
];

async function captureUserGuideScreenshots(config) {
  console.log(`🌐 Capturing user guide screenshots for ${config.name}...`);
  
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
    console.log('📁 MANUAL SETUP REQUIRED:');
    console.log(`   For ${config.name} screenshots:`);
    console.log('   1. Open the test_7 project manually:');
    console.log('      - Click "Open Existing Project"');
    console.log('      - Navigate to: C:\\code\\audiolibros\\khipu-studio\\reference-code\\test_7');
    console.log('      - Wait for project to load completely');
    console.log('   2. Press ENTER when ready to start capturing screenshots...');
    console.log('');
    
    // Wait for user confirmation
    await new Promise((resolve) => {
      process.stdin.once('data', () => resolve());
    });

    let screenshotIndex = 1;
    
    // Helper function
    async function takeScreenshot(name, description, url = null) {
      if (url) {
        console.log(`🌐 Navigating to: ${url}`);
        await page.goto(url, { waitUntil: 'networkidle2' });
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      const filename = `${screenshotIndex.toString().padStart(2, '0')}-${name}.png`;
      const fullPath = path.join(screenshotsDir, filename);

      console.log(`📸 ${description}`);
      await page.screenshot({ path: fullPath, fullPage: true });
      console.log(`   ✅ Saved: ${filename}`);
      screenshotIndex++;
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    console.log('📚 Starting User Guide screenshot sequence...');
    console.log('');

    // === SECTION 1: GETTING STARTED ===
    console.log('🚀 Section 1: Getting Started');
    
    // 01. First Launch - Home screen with project loaded
    await takeScreenshot('home-with-project', 'Getting Started: Home screen with project loaded', 'http://localhost:5173/');
    
    // === SECTION 2: QUICK START WORKFLOW ===
    console.log('📋 Section 2: Quick Start Workflow');
    
    // 02. Step 1: Show Create New Project dialog (for documentation)
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const createButton = buttons.find(btn => 
        btn.textContent && 
        (btn.textContent.includes('Create New') || 
         btn.textContent.includes('Crear nuevo') ||
         btn.textContent.includes('Criar novo'))
      );
      if (createButton) createButton.click();
    });
    await new Promise(resolve => setTimeout(resolve, 1000));
    await takeScreenshot('create-project-dialog', 'Step 1: Create New Project dialog');
    
    // Cancel and continue
    await page.evaluate(() => {
      const cancelBtn = Array.from(document.querySelectorAll('button')).find(btn => 
        btn.textContent && (btn.textContent.includes('Cancel') || btn.textContent.includes('Cancelar'))
      );
      if (cancelBtn) cancelBtn.click();
    });
    await new Promise(resolve => setTimeout(resolve, 1000));

    // === SECTION 3: PROJECT WORKFLOW WITH DATA ===
    console.log('📖 Section 3: Project Workflow (with loaded test_7 data)');
    
    // 03. Step 2: Book Configuration
    await takeScreenshot('book-configuration', 'Step 2: Book Configuration', 'http://localhost:5173/book');
    
    // 04. Step 3: Manuscript Management  
    await takeScreenshot('manuscript-management', 'Step 3: Manuscript Management', 'http://localhost:5173/manuscript');
    
    // 05. Step 4: Character Setup (Dossier)
    await takeScreenshot('character-setup', 'Step 4: Character Setup - Dossier', 'http://localhost:5173/dossier');
    
    // 06. Step 5: Voice Casting
    await takeScreenshot('voice-casting', 'Step 5: Voice Casting', 'http://localhost:5173/casting');
    
    // 07. Step 6: Content Planning
    await takeScreenshot('content-planning', 'Step 6: Content Planning', 'http://localhost:5173/planning');
    
    // 08. Step 7: Audio Production
    await takeScreenshot('audio-production', 'Step 7: Audio Production', 'http://localhost:5173/voice');
    
    // 09. Step 8: Export & Packaging
    await takeScreenshot('export-packaging', 'Step 8: Export & Packaging', 'http://localhost:5173/packaging');
    
    // === SECTION 4: NAVIGATION GUIDE ===
    console.log('🧭 Section 4: Navigation Guide');
    
    // 10. Navigation overview from home
    await takeScreenshot('navigation-overview', 'Navigation Guide: Application overview', 'http://localhost:5173/');
    
    // 11. Settings page
    await takeScreenshot('settings-configuration', 'Settings & Configuration', 'http://localhost:5173/settings');

    console.log('');
    console.log(`✅ ${config.name} user guide screenshots completed!`);
    console.log(`📂 Screenshots saved in: screenshots/${config.screenshotPrefix}/`);
    console.log('');
    
  } catch (error) {
    console.error(`❌ Error for ${config.name}:`, error.message);
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log('🚀 Starting Manual User Guide screenshot capture...');
  console.log('📚 Captures comprehensive screenshots for User Guide documentation');
  console.log('📖 One language at a time with manual project loading');
  console.log('🎯 Optimized for reliability and completeness');
  console.log('');
  
  for (const config of LANGUAGE_CONFIGS) {
    await captureUserGuideScreenshots(config);
    
    if (config !== LANGUAGE_CONFIGS[LANGUAGE_CONFIGS.length - 1]) {
      console.log('🔄 Preparing for next language...');
      console.log('   Please refresh the browser or close/reopen project if needed');
      console.log('   Press ENTER when ready for the next language...');
      await new Promise((resolve) => {
        process.stdin.once('data', () => resolve());
      });
      console.log('');
    }
  }
  
  console.log('');
  console.log('🎉 All User Guide screenshots completed!');
  console.log('📂 Screenshots organized by language in: screenshots/user-guide-[language]/');
  console.log('📋 Coverage:');
  console.log('   ✅ Getting Started (home with project)');
  console.log('   ✅ Quick Start Workflow (create dialog + 8 workflow steps)');
  console.log('   ✅ Navigation Guide (overview + settings)');
  console.log('   ✅ All screenshots with real project data from test_7');
  console.log('');
  console.log('✨ Ready for User Guide documentation integration!');
}

main().catch(console.error);