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

async function captureScreenshotsForLanguage(config) {
  console.log(`🌐 Starting screenshot capture for ${config.name}...`);
  
  // Create language-specific screenshots directory
  const screenshotsDir = path.join(__dirname, 'screenshots', config.screenshotPrefix);
  try {
    await fs.mkdir(screenshotsDir, { recursive: true });
  } catch (err) {
    // Directory already exists
  }

  // Launch browser
  const browser = await puppeteer.launch({
    headless: false, // Set to true for headless mode
    defaultViewport: {
      width: 1920,
      height: 1080
    }
  });

  const page = await browser.newPage();
  
  // Navigate to the local development server
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle2' });
  
  // Apply dark theme
  console.log('🌙 Setting dark theme...');
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
  });
  
  // Set language - try multiple approaches since web version may not have full i18n
  console.log(`🌐 Setting language to ${config.language}...`);
  await page.evaluate((lang) => {
    // Set localStorage for language preference
    localStorage.setItem('khipu.lang', lang);
    
    // Try to access i18n if available
    if (typeof window !== 'undefined') {
      if (window.i18n) {
        window.i18n.changeLanguage(lang);
      } else if (window.i18next) {
        window.i18next.changeLanguage(lang);
      }
    }
  }, config.language);
  
  // Reload page to ensure language and theme are applied
  await page.reload({ waitUntil: 'networkidle2' });
  
  // Wait for React to fully re-render with dark theme and language
  await page.waitForTimeout(3000);
  console.log('🎨 Dark theme and language applied');
  
  let screenshotIndex = 1;

  // Helper function to take screenshot
  async function takeScreenshot(name, description) {
    const filename = `${screenshotIndex.toString().padStart(2, '0')}-${name}.png`;
    const fullPath = path.join(screenshotsDir, filename);
    
    console.log(`📸 Capturing: ${description}`);
    await page.screenshot({ 
      path: fullPath,
      fullPage: true 
    });
    console.log(`   Saved: ${filename}`);
    screenshotIndex++;
    
    // Small delay between screenshots
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  try {
    // Wait for app to load
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 1. Home screen
    await takeScreenshot('home-screen', 'Home screen with recent projects');
    
    // 2. Create new project
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const createButton = buttons.find(btn => 
        btn.textContent && 
        (btn.textContent.includes('Create New Project') || btn.textContent.includes('Crear nuevo proyecto'))
      );
      if (createButton) createButton.click();
    });
    await new Promise(resolve => setTimeout(resolve, 500));
    await takeScreenshot('create-project-dialog', 'Create new project dialog');
    
    // Fill form
    await page.type('input[placeholder*="audiobook"]', config.projectPath);
    await page.type('input[placeholder*="project"]', config.projectName);
    await takeScreenshot('create-project-filled', 'Create project dialog filled');
    
    // Submit form
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const createButton = buttons.find(btn => 
        btn.textContent && 
        (btn.textContent.includes('Create Project') || btn.textContent.includes('Crear proyecto'))
      );
      if (createButton) createButton.click();
    });
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 3. Navigate through available pages
    const pages = [
      { name: 'Book', description: 'Book configuration page' },
      { name: 'Manuscript', description: 'Manuscript management page' },
      { name: 'Settings', description: 'Settings page' }
    ];
    
    for (const pageInfo of pages) {
      try {
        await page.click(`text=${pageInfo.name}`);
        await new Promise(resolve => setTimeout(resolve, 1500));
        await takeScreenshot(pageInfo.name.toLowerCase(), pageInfo.description);
      } catch (e) {
        console.log(`⚠️  ${pageInfo.name} page not accessible:`, e.message);
      }
    }
    
    console.log(`✅ Screenshot capture for ${config.name} completed!`);
    console.log(`📁 Screenshots saved in: ${screenshotsDir}`);
    
  } catch (error) {
    console.error(`❌ Error during screenshot capture for ${config.name}:`, error);
  } finally {
    await browser.close();
  }
}

// Main function to run all language configurations
async function captureAllLanguages() {
  console.log('🚀 Starting multi-language screenshot capture...');
  
  for (const config of LANGUAGE_CONFIGS) {
    await captureScreenshotsForLanguage(config);
    // Small delay between languages
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log('🎉 All language screenshots completed!');
}

// Run the screenshot capture for all languages
captureAllLanguages().catch(console.error);