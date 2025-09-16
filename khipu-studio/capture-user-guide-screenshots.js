const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs').promises;

// Language configurations
const LANGUAGE_CONFIGS = [
  {
    name: 'English (US)',
    language: 'en-US',
    screenshotPrefix: 'user-guide-en-us',
    projectName: 'My Audiobook Project',
    projectPath: 'C:\\temp\\khipu-test'
  },
  {
    name: 'Español (Perú)', 
    language: 'es-PE',
    screenshotPrefix: 'user-guide-es-pe',
    projectName: 'Mi Proyecto de Audiolibro',
    projectPath: 'C:\\temp\\khipu-test'
  },
  {
    name: 'Português (Brasil)',
    language: 'pt-BR', 
    screenshotPrefix: 'user-guide-pt-br',
    projectName: 'Meu Projeto de Audiolivro',
    projectPath: 'C:\\temp\\khipu-test'
  }
];

// Test project path for populated screenshots
const TEST_PROJECT_PATH = 'C:\\code\\audiolibros\\khipu-studio\\reference-code\\test_7';

async function captureForOneLanguage(config) {
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

    // === GETTING STARTED & PROJECT SETUP ===
    console.log('📋 Section 1: Getting Started & Project Setup');
    
    // 01. Clean home screen
    await takeScreenshot('home-empty', 'Clean home screen without projects');
    
    // 02. Create project dialog
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
    await takeScreenshot('create-project-dialog', 'Create project dialog - empty');
    
    // 03. Fill project dialog
    await page.evaluate((config) => {
      // Fill in project name
      const nameInput = document.querySelector('input[placeholder*="name"], input[placeholder*="nombre"], input[placeholder*="nome"]');
      if (nameInput) {
        nameInput.value = config.projectName;
        nameInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      
      // Fill in project path
      const pathInput = document.querySelector('input[type="text"]:not([placeholder*="name"]):not([placeholder*="nombre"]):not([placeholder*="nome"])');
      if (pathInput) {
        pathInput.value = config.projectPath;
        pathInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, config);
    await new Promise(resolve => setTimeout(resolve, 500));
    await takeScreenshot('create-project-filled', 'Create project dialog - filled');
    
    // Cancel dialog - we'll capture empty state screenshots first
    await page.evaluate(() => {
      const cancelBtn = Array.from(document.querySelectorAll('button')).find(btn => 
        btn.textContent && (btn.textContent.includes('Cancel') || btn.textContent.includes('Cancelar'))
      );
      if (cancelBtn) cancelBtn.click();
    });
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log(`🎯 Phase 1 complete for ${config.name}: Empty state screenshots captured`);
    console.log(`⚠️  MANUAL STEP REQUIRED:`);
    console.log(`   1. Please open the test project in the browser window`); 
    console.log(`   2. Navigate to: File → Open Project → ${TEST_PROJECT_PATH}`);
    console.log(`   3. Wait for project to fully load (sidebar with tabs appears)`);
    console.log(`   4. Press ENTER in this terminal to continue...`);
    
    // Wait for user input
    await new Promise((resolve) => {
      process.stdin.once('data', () => resolve());
    });
    
    console.log('📂 Continuing with populated project screenshots...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // === BOOK CONFIGURATION ===
    console.log('📖 Section 2: Book Configuration');
    
    // 04. Navigate to Book tab
    await page.evaluate(() => {
      const bookLink = document.querySelector('a[href="/book"], a[href*="book"]');
      if (bookLink) bookLink.click();
    });
    await new Promise(resolve => setTimeout(resolve, 2000));
    await takeScreenshot('book-config-page', 'Book configuration page');
    
    // === MANUSCRIPT MANAGEMENT ===
    console.log('📑 Section 3: Manuscript Management');
    
    // 05. Navigate to Manuscript tab
    await page.evaluate(() => {
      const manuscriptLink = document.querySelector('a[href="/manuscript"], a[href*="manuscript"]');
      if (manuscriptLink) manuscriptLink.click();
    });
    await new Promise(resolve => setTimeout(resolve, 2000));
    await takeScreenshot('manuscript-page', 'Manuscript management page');
    
    // === CHARACTER MANAGEMENT (DOSSIER) ===
    console.log('👥 Section 4: Character Management');
    
    // 06. Navigate to Dossier tab
    await page.evaluate(() => {
      const dossierLink = document.querySelector('a[href="/dossier"], a[href*="dossier"]');
      if (dossierLink) dossierLink.click();
    });
    await new Promise(resolve => setTimeout(resolve, 2000));
    await takeScreenshot('dossier-page', 'Character management (Dossier) page');
    
    // === VOICE CASTING ===
    console.log('🎭 Section 5: Voice Casting');
    
    // 07. Navigate to Casting tab
    await page.evaluate(() => {
      const castingLink = document.querySelector('a[href="/casting"], a[href*="casting"]');
      if (castingLink) castingLink.click();
    });
    await new Promise(resolve => setTimeout(resolve, 2000));
    await takeScreenshot('casting-page', 'Voice casting page');
    
    // === CONTENT PLANNING ===
    console.log('📋 Section 6: Content Planning');
    
    // 08. Navigate to Planning tab
    await page.evaluate(() => {
      const planningLink = document.querySelector('a[href="/planning"], a[href*="planning"]');
      if (planningLink) planningLink.click();
    });
    await new Promise(resolve => setTimeout(resolve, 2000));
    await takeScreenshot('planning-page', 'Content planning page');
    
    // === AUDIO PRODUCTION ===
    console.log('🎤 Section 7: Audio Production');
    
    // 09. Navigate to Voice/Audio tab
    await page.evaluate(() => {
      const voiceLink = document.querySelector('a[href="/voice"], a[href*="voice"], a[href="/audio"], a[href*="audio"]');
      if (voiceLink) voiceLink.click();
    });
    await new Promise(resolve => setTimeout(resolve, 2000));
    await takeScreenshot('audio-production-page', 'Audio production page');
    
    // === EXPORT & PACKAGING ===
    console.log('📦 Section 8: Export & Packaging');
    
    // 10. Navigate to Packaging tab
    await page.evaluate(() => {
      const packagingLink = document.querySelector('a[href="/packaging"], a[href*="packaging"]');
      if (packagingLink) packagingLink.click();
    });
    await new Promise(resolve => setTimeout(resolve, 2000));
    await takeScreenshot('packaging-page', 'Export and packaging page');
    
    // === SETTINGS & CONFIGURATION ===
    console.log('⚙️ Section 9: Settings & Configuration');
    
    // 11. Navigate to Settings tab
    await page.evaluate(() => {
      const settingsLink = document.querySelector('a[href="/settings"], a[href*="settings"]');
      if (settingsLink) settingsLink.click();
    });
    await new Promise(resolve => setTimeout(resolve, 2000));
    await takeScreenshot('settings-page', 'Settings and configuration page');
    
    // === NAVIGATION & HOME WITH PROJECT ===
    console.log('🏠 Section 10: Navigation & Home with Project');
    
    // 12. Navigate back to Home
    await page.evaluate(() => {
      const homeLink = document.querySelector('a[href="/"], a[href="/home"]');
      if (homeLink) homeLink.click();
    });
    await new Promise(resolve => setTimeout(resolve, 2000));
    await takeScreenshot('home-with-project', 'Home screen with project loaded');

    console.log(`✅ ${config.name} user guide screenshots completed!`);
    
  } catch (error) {
    console.error(`❌ Error for ${config.name}:`, error.message);
    console.error(error.stack);
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log('🚀 Starting comprehensive multi-language user guide screenshot capture...');
  console.log('📚 This will capture screenshots for all major features and workflow sections');
  
  for (const config of LANGUAGE_CONFIGS) {
    await captureForOneLanguage(config);
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log('🎉 All user guide screenshots completed!');
  console.log('📂 Screenshots saved in: screenshots/user-guide-[language]/');
  console.log('📋 Screenshots are organized by workflow section and numbered sequentially');
}

main().catch(console.error);