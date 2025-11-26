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
    
    console.log(`✅ Phase 1 complete for ${config.name}: Empty state screenshots captured`);
    console.log('');
    console.log('🔄 Starting Phase 2: Screenshots with project data');
    console.log('📝 Note: For populated screenshots, either:');
    console.log('   - Use existing screenshots from Phase 1, or');
    console.log('   - Manually open a project and run a separate script');
    console.log('');
    
    // Continue with navigation screenshots using empty state
    // This will show the interface structure even without project data
    
    // === NAVIGATION TOUR (EMPTY STATE) ===
    console.log('🧭 Section 2: Application Navigation Tour');
    
    // Try to navigate through available tabs to show interface structure
    
    // Try to navigate through available tabs to show interface structure
    
    // 04. Try Settings first (should always be available)
    try {
      await page.evaluate(() => {
        const settingsLink = document.querySelector('a[href="/settings"], a[href*="settings"]');
        if (settingsLink) settingsLink.click();
      });
      await new Promise(resolve => setTimeout(resolve, 2000));
      await takeScreenshot('settings-page', 'Settings and configuration page (empty state)');
    } catch (error) {
      console.log('   ⚠️  Could not navigate to Settings');
    }
    
    // 05. Back to home
    try {
      await page.evaluate(() => {
        const homeLink = document.querySelector('a[href="/"], a[href="/home"]');
        if (homeLink) homeLink.click();
      });
      await new Promise(resolve => setTimeout(resolve, 2000));
      await takeScreenshot('home-after-navigation', 'Home screen after navigation tour');
    } catch (error) {
      console.log('   ⚠️  Could not navigate back to Home');
    }
    
    // === PROJECT WORKFLOW DEMO (EMPTY STATE) ===
    console.log('📋 Section 3: Project Workflow Interface (Empty State)');
    
    // Note: These will show the interface structure without data
    const workflowPages = [
      { path: '/book', name: 'book-interface', description: 'Book configuration interface' },
      { path: '/manuscript', name: 'manuscript-interface', description: 'Manuscript management interface' },
      { path: '/dossier', name: 'dossier-interface', description: 'Character management interface' },
      { path: '/casting', name: 'casting-interface', description: 'Voice casting interface' },
      { path: '/planning', name: 'planning-interface', description: 'Content planning interface' },
      { path: '/voice', name: 'voice-interface', description: 'Audio production interface' },
      { path: '/packaging', name: 'packaging-interface', description: 'Export and packaging interface' }
    ];
    
    for (const workflowPage of workflowPages) {
      try {
        // Try direct navigation to URL
        await page.goto(`http://localhost:5173${workflowPage.path}`, { waitUntil: 'networkidle2' });
        await new Promise(resolve => setTimeout(resolve, 2000));
        await takeScreenshot(workflowPage.name, workflowPage.description);
        console.log(`   ✅ Captured ${workflowPage.name}`);
      } catch (error) {
        console.log(`   ⚠️  Could not capture ${workflowPage.name}: ${error.message}`);
      }
    }

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