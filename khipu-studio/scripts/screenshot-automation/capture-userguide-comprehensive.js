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

    // === SECTION 1: GETTING STARTED ===
    console.log('🚀 Section 1: Getting Started');
    
    // 01. First Launch - Home screen
    await takeScreenshot('first-launch-home', 'First Launch: Home screen (User Guide: Getting Started)');
    
    // === SECTION 2: QUICK START WORKFLOW ===
    console.log('📋 Section 2: Quick Start Workflow');
    
    // 02. Step 1: Create New Project - Dialog
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
    await takeScreenshot('create-project-dialog', 'Step 1: Create New Project dialog (User Guide: Quick Start)');
    
    // 03. Fill form for demo
    await page.evaluate((config) => {
      // Fill in project name
      const nameInput = document.querySelector('input[placeholder*="name"], input[placeholder*="nombre"], input[placeholder*="nome"]');
      if (nameInput) {
        nameInput.value = "my-first-audiobook";
        nameInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      
      // Fill in project path  
      const pathInput = document.querySelector('input[type="text"]:not([placeholder*="name"]):not([placeholder*="nombre"]):not([placeholder*="nome"])');
      if (pathInput) {
        pathInput.value = "C:\\audiobook-projects";
        pathInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, config);
    await new Promise(resolve => setTimeout(resolve, 500));
    await takeScreenshot('create-project-filled', 'Step 1: Create Project dialog filled (User Guide: Quick Start)');
    
    // Cancel to continue with screenshots
    await page.evaluate(() => {
      const cancelBtn = Array.from(document.querySelectorAll('button')).find(btn => 
        btn.textContent && (btn.textContent.includes('Cancel') || btn.textContent.includes('Cancelar'))
      );
      if (cancelBtn) cancelBtn.click();
    });
    await new Promise(resolve => setTimeout(resolve, 1000));

    // === AUTOMATED PROJECT LOADING ===
    console.log('📁 Loading test_7 project directly...');
    
    const projectPath = 'C:\\code\\audiolibros\\khipu-studio\\reference-code\\test_7';
    console.log(`📂 Loading project: ${projectPath}`);
    
    // Directly call the project open function (bypassing file dialog)
    const projectOpened = await page.evaluate(async (path) => {
      try {
        // Call the project open function directly
        if (window.khipu) {
          const result = await window.khipu.call("project:open", { path });
          console.log('Project open result:', result);
          return true;
        }
        return false;
      } catch (error) {
        console.error('Error opening project:', error);
        return false;
      }
    }, projectPath);
    
    if (projectOpened) {
      console.log('✅ Project open call successful');
      
      // Wait for project to load and navigate to book page
      console.log('⏳ Waiting for project to load completely...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Navigate to book page to trigger project loading UI
      await page.goto('http://localhost:5173/book', { waitUntil: 'networkidle2' });
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check if we have project content loaded
      const hasProjectContent = await page.evaluate(() => {
        const content = document.body.textContent || '';
        // Look for any non-empty project content indicators
        return content.length > 1000 || 
               document.querySelector('input[value], textarea:not(:empty), [data-loaded]') !== null;
      });
      
      if (hasProjectContent) {
        console.log('✅ Project loaded successfully with content!');
      } else {
        console.log('⚠️ Project loaded but content may still be loading...');
      }
      
      // Return to home to start screenshots
      await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } else {
      console.log('❌ Failed to open project automatically');
      console.log('📁 MANUAL STEP REQUIRED:');
      console.log('   Please manually open the project:');
      console.log('   1. Click "Open Existing Project"');
      console.log('   2. Navigate to: C:\\code\\audiolibros\\khipu-studio\\reference-code\\test_7');
      console.log('   3. Press ENTER when project is loaded...');
      
      // Wait for user input
      await new Promise((resolve) => {
        process.stdin.once('data', () => resolve());
      });
    }

    // === SECTION 3: PROJECT WORKFLOW WITH DATA ===
    console.log('📖 Section 3: Project Workflow');
    
    // 04. Step 2: Book Configuration
    await page.goto('http://localhost:5173/book', { waitUntil: 'networkidle2' });
    await new Promise(resolve => setTimeout(resolve, 2000));
    await takeScreenshot('book-configuration', 'Step 2: Book Configuration (User Guide: Configure Your Book)');
    
    // 05. Step 3: Manuscript Management
    await page.goto('http://localhost:5173/manuscript', { waitUntil: 'networkidle2' });
    await new Promise(resolve => setTimeout(resolve, 2000));
    await takeScreenshot('manuscript-management', 'Step 3: Manuscript Management (User Guide: Import Your Manuscript)');
    
    // 06. Step 4: Character Setup (Dossier)
    await page.goto('http://localhost:5173/dossier', { waitUntil: 'networkidle2' });
    await new Promise(resolve => setTimeout(resolve, 2000));
    await takeScreenshot('character-setup', 'Step 4: Character Setup - Dossier (User Guide: Set Up Characters)');
    
    // 07. Step 5: Voice Casting
    await page.goto('http://localhost:5173/casting', { waitUntil: 'networkidle2' });
    await new Promise(resolve => setTimeout(resolve, 2000));
    await takeScreenshot('voice-casting', 'Step 5: Voice Casting (User Guide: Choose Voices)');
    
    // 08. Step 6: Content Planning
    await page.goto('http://localhost:5173/planning', { waitUntil: 'networkidle2' });
    await new Promise(resolve => setTimeout(resolve, 2000));
    await takeScreenshot('content-planning', 'Step 6: Content Planning (User Guide: Generate Audio Plan)');
    
    // 09. Step 7: Audio Production
    await page.goto('http://localhost:5173/voice', { waitUntil: 'networkidle2' });
    await new Promise(resolve => setTimeout(resolve, 2000));
    await takeScreenshot('audio-production', 'Step 7: Audio Production (User Guide: Produce Audio)');
    
    // 10. Step 8: Export & Packaging
    await page.goto('http://localhost:5173/packaging', { waitUntil: 'networkidle2' });
    await new Promise(resolve => setTimeout(resolve, 2000));
    await takeScreenshot('export-packaging', 'Step 8: Export & Packaging (User Guide: Export Your Audiobook)');
    
    // === SECTION 4: NAVIGATION GUIDE ===
    console.log('🧭 Section 4: Navigation Guide');
    
    // 11. Home with project (shows navigation sidebar)
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });
    await new Promise(resolve => setTimeout(resolve, 2000));
    await takeScreenshot('navigation-home', 'Navigation Guide: Home with loaded project (User Guide: Navigation)');
    
    // 12. Settings page
    await page.goto('http://localhost:5173/settings', { waitUntil: 'networkidle2' });
    await new Promise(resolve => setTimeout(resolve, 2000));
    await takeScreenshot('settings-configuration', 'Settings & Configuration (User Guide: Application Preferences)');

    console.log(`✅ ${config.name} user guide screenshots completed!`);
    
  } catch (error) {
    console.error(`❌ Error for ${config.name}:`, error.message);
    console.error(error.stack);
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log('🚀 Starting comprehensive User Guide screenshot capture...');
  console.log('📚 This captures all screenshots referenced in the User Guide documentation');
  console.log('📖 Covers: Getting Started → Quick Start Workflow → Navigation Guide');
  console.log('🤖 Fully automated - opens test_7 project for each language');
  console.log('');
  
  for (const config of LANGUAGE_CONFIGS) {
    await captureUserGuideScreenshots(config);
    
    if (config !== LANGUAGE_CONFIGS[LANGUAGE_CONFIGS.length - 1]) {
      console.log('');
      console.log('🔄 Preparing for next language...');
      console.log('   Refreshing to empty state for next language setup...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log('');
  console.log('🎉 All User Guide screenshots completed!');
  console.log('📂 Screenshots saved in: screenshots/user-guide-[language]/');
  console.log('📋 Screenshots organized by User Guide sections:');
  console.log('   • Getting Started (01)');
  console.log('   • Quick Start Workflow (02-10)');
  console.log('   • Navigation Guide (11-12)');
  console.log('');
  console.log('✨ Ready for documentation integration!');
}

main().catch(console.error);