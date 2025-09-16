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
    console.log('');
    console.log('🖥️  ELECTRON APP SETUP REQUIRED:');
    console.log(`   For ${config.name} screenshots:`);
    console.log('   1. Start the Electron app:');
    console.log('      cd app && npm run dev');
    console.log('   2. Open the test_7 project in the Electron app:');
    console.log('      - Click "Open Existing Project"');
    console.log('      - Navigate to: C:\\code\\audiolibros\\khipu-studio\\reference-code\\test_7');
    console.log('      - Wait for project to load completely');
    console.log(`   3. Set language to ${config.name} in settings`);
    console.log('   4. Set theme to Dark mode in settings');
    console.log('   5. Press ENTER when Electron app is ready...');
    console.log('');
    
    // Wait for user confirmation
    await new Promise((resolve) => {
      process.stdin.once('data', () => resolve());
    });

    // Connect to Electron app running on port 5174
    let electronConnected = false;
    const electronPorts = [5174, 5173, 3000, 8080];
    
    for (const port of electronPorts) {
      try {
        console.log(`🔌 Trying to connect to Electron app at localhost:${port}...`);
        await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle2', timeout: 5000 });
        
        // Check if we can detect Electron environment
        const isElectron = await page.evaluate(() => {
          return typeof window.khipu !== 'undefined' || 
                 typeof window.require !== 'undefined' ||
                 navigator.userAgent.includes('Electron');
        });
        
        if (isElectron) {
          console.log(`✅ Connected to Electron app at localhost:${port}`);
          electronConnected = true;
          break;
        }
      } catch (error) {
        console.log(`❌ Port ${port} not available`);
      }
    }
    
    if (!electronConnected) {
      console.log('');
      console.log('❌ Could not connect to Electron app automatically.');
      console.log('📋 MANUAL SCREENSHOT INSTRUCTIONS:');
      console.log('   Since we cannot connect to the Electron app automatically,');
      console.log('   please take screenshots manually using these steps:');
      console.log('');
      console.log(`   Screenshots needed for ${config.name}:`);
      console.log('   01. Home screen with project loaded');
      console.log('   02. Create New Project dialog (for documentation)');
      console.log('   03. Book Configuration page (/book)');
      console.log('   04. Manuscript Management page (/manuscript)'); 
      console.log('   05. Character Setup - Dossier page (/dossier)');
      console.log('   06. Voice Casting page (/casting)');
      console.log('   07. Content Planning page (/planning)');
      console.log('   08. Audio Production page (/voice)');
      console.log('   09. Export & Packaging page (/packaging)');
      console.log('   10. Settings page (/settings)');
      console.log('');
      console.log(`   Save them in: screenshots/${config.screenshotPrefix}/`);
      console.log('   Use dark theme and project data from test_7');
      console.log('');
      return;
    }

    // If we're connected, proceed with automated screenshots
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
    await takeScreenshot('home-with-project', 'Getting Started: Home screen with project loaded');
    
    // === SECTION 2: QUICK START WORKFLOW ===
    console.log('📋 Section 2: Quick Start Workflow');
    
    // Show Create New Project dialog
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
    
    // Cancel dialog
    await page.evaluate(() => {
      const cancelBtn = Array.from(document.querySelectorAll('button')).find(btn => 
        btn.textContent && (btn.textContent.includes('Cancel') || btn.textContent.includes('Cancelar'))
      );
      if (cancelBtn) cancelBtn.click();
    });
    await new Promise(resolve => setTimeout(resolve, 1000));

    // === SECTION 3: PROJECT WORKFLOW ===
    console.log('📖 Section 3: Project Workflow');
    
    // Navigate through all workflow pages
    const pages = [
      { url: '/book', name: 'book-configuration', desc: 'Step 2: Book Configuration' },
      { url: '/manuscript', name: 'manuscript-management', desc: 'Step 3: Manuscript Management' },
      { url: '/dossier', name: 'character-setup', desc: 'Step 4: Character Setup - Dossier' },
      { url: '/casting', name: 'voice-casting', desc: 'Step 5: Voice Casting' },
      { url: '/planning', name: 'content-planning', desc: 'Step 6: Content Planning' },
      { url: '/voice', name: 'audio-production', desc: 'Step 7: Audio Production' },
      { url: '/packaging', name: 'export-packaging', desc: 'Step 8: Export & Packaging' }
    ];
    
    for (const pageInfo of pages) {
      const currentUrl = await page.url();
      const baseUrl = currentUrl.split('/').slice(0, 3).join('/');
      await takeScreenshot(pageInfo.name, pageInfo.desc, baseUrl + pageInfo.url);
    }

    // === SECTION 4: NAVIGATION GUIDE ===
    console.log('🧭 Section 4: Navigation Guide');
    
    const currentUrl = await page.url();
    const baseUrl = currentUrl.split('/').slice(0, 3).join('/');
    await takeScreenshot('settings-configuration', 'Settings & Configuration', baseUrl + '/settings');

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
  console.log('🚀 Starting Electron User Guide screenshot capture...');
  console.log('📚 Captures comprehensive screenshots using the Electron app');
  console.log('🖥️  Requires Electron app running with test_7 project loaded');
  console.log('');
  
  for (const config of LANGUAGE_CONFIGS) {
    await captureUserGuideScreenshots(config);
    
    if (config !== LANGUAGE_CONFIGS[LANGUAGE_CONFIGS.length - 1]) {
      console.log('🔄 Preparing for next language...');
      console.log(`   Please change language to ${LANGUAGE_CONFIGS[LANGUAGE_CONFIGS.indexOf(config) + 1].name} in Electron app`);
      console.log('   Press ENTER when ready for the next language...');
      await new Promise((resolve) => {
        process.stdin.once('data', () => resolve());
      });
      console.log('');
    }
  }
  
  console.log('');
  console.log('🎉 All User Guide screenshots completed!');
  console.log('📂 Screenshots organized by language');
  console.log('✨ Ready for User Guide documentation integration!');
}

main().catch(console.error);