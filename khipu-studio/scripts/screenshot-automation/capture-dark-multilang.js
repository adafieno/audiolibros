const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs').promises;

// Language configurations
const LANGUAGE_CONFIGS = [
  {
    name: 'English (US)',
    language: 'en-US',
    screenshotPrefix: 'dark-en-us',
    projectName: 'My Audiobook Project',
    projectPath: 'C:\\temp\\khipu-test'
  },
  {
    name: 'Español (Perú)', 
    language: 'es-PE',
    screenshotPrefix: 'dark-es-pe',
    projectName: 'Mi Proyecto de Audiolibro',
    projectPath: 'C:\\temp\\khipu-test'
  },
  {
    name: 'Português (Brasil)',
    language: 'pt-BR', 
    screenshotPrefix: 'dark-pt-br',
    projectName: 'Meu Projeto de Audiolivro',
    projectPath: 'C:\\temp\\khipu-test'
  }
];

async function captureForOneLanguage(config) {
  console.log(`🌐 Capturing screenshots for ${config.name}...`);
  
  const screenshotsDir = path.join(__dirname, 'screenshots', config.screenshotPrefix);
  await fs.mkdir(screenshotsDir, { recursive: true });
  
  const browser = await puppeteer.launch({ headless: false });
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

    // Verify language setting with retries
    let retries = 3;
    while (retries > 0) {
      const currentLanguage = await page.evaluate(() => localStorage.getItem('khipu.lang'));
      if (currentLanguage === config.language) {
        break;
      }
      console.log(`🔄 Retrying language setting for ${config.name}...`);
      await page.evaluate((lang) => {
        localStorage.setItem('khipu.lang', lang);
      }, config.language);
      await page.reload({ waitUntil: 'networkidle2' });
      await new Promise(resolve => setTimeout(resolve, 3000));
      retries--;
    }

    if (retries === 0) {
      throw new Error(`Language verification failed after retries. Expected: ${config.language}`);
    }

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
    
    // Take screenshots
    await takeScreenshot('home-screen', 'Home screen');
    
    // Click create button
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
    await takeScreenshot('create-dialog', 'Create project dialog');

    console.log(`✅ ${config.name} screenshots completed!`);

  } catch (error) {
    console.error(`❌ Error for ${config.name}:`, error.message);
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log('🚀 Starting multi-language dark theme screenshot capture...');
  
  for (const config of LANGUAGE_CONFIGS) {
    await captureForOneLanguage(config);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('🎉 All screenshots completed!');
}

main().catch(console.error);