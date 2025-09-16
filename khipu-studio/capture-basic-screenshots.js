const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs').promises;

// Language configurations
const LANGUAGE_CONFIGS = [
  {
    name: 'English (US)',
    language: 'en-US',
    screenshotPrefix: 'basic-en-us'
  },
  {
    name: 'Español (Perú)', 
    language: 'es-PE',
    screenshotPrefix: 'basic-es-pe'
  },
  {
    name: 'Português (Brasil)',
    language: 'pt-BR', 
    screenshotPrefix: 'basic-pt-br'
  }
];

async function captureBasicScreenshots(config) {
  console.log(`🌐 Capturing basic screenshots for ${config.name}...`);
  
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
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // === BASIC WORKFLOW SCREENSHOTS ===
    console.log('📋 Basic workflow screenshots');
    
    // 01. Home screen (empty state)
    await takeScreenshot('home-empty', 'Home screen - empty state');
    
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
    await takeScreenshot('create-project-dialog', 'Create project dialog');
    
    // 03. Cancel dialog
    await page.evaluate(() => {
      const cancelBtn = Array.from(document.querySelectorAll('button')).find(btn => 
        btn.textContent && (btn.textContent.includes('Cancel') || btn.textContent.includes('Cancelar'))
      );
      if (cancelBtn) cancelBtn.click();
    });
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 04. Settings page (should always be accessible)
    try {
      await page.goto('http://localhost:5173/settings', { waitUntil: 'networkidle2' });
      await new Promise(resolve => setTimeout(resolve, 2000));
      await takeScreenshot('settings-page', 'Settings page');
    } catch (error) {
      console.log('   ⚠️  Could not navigate to settings');
    }
    
    // 05. Back to home
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });
    await new Promise(resolve => setTimeout(resolve, 1000));
    await takeScreenshot('home-final', 'Home screen - final state');

    console.log(`✅ ${config.name} basic screenshots completed!`);
    
  } catch (error) {
    console.error(`❌ Error for ${config.name}:`, error.message);
    console.error(error.stack);
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log('🚀 Starting basic multi-language screenshot capture...');
  console.log('📚 This captures essential screenshots that work reliably');
  
  for (const config of LANGUAGE_CONFIGS) {
    await captureBasicScreenshots(config);
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log('🎉 All basic screenshots completed!');
  console.log('📂 Screenshots saved in: screenshots/basic-[language]/');
}

main().catch(console.error);