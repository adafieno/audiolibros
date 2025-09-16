const screenshot = require('screenshot-desktop');
const path = require('path');
const fs = require('fs').promises;

class AutomatedElectronScreenshots {
  constructor() {
    this.screenshotDir = path.join(__dirname, 'screenshots');
    this.currentLangDir = '';
    this.screenshotIndex = 1;
    this.languages = [
      { code: 'en-US', name: 'English (US)', folder: 'user-guide-en-us' },
      { code: 'es-PE', name: 'Español (Perú)', folder: 'user-guide-es-pe' },
      { code: 'pt-BR', name: 'Português (Brasil)', folder: 'user-guide-pt-br' }
    ];
    this.workflows = [
      { name: 'home-with-project', description: 'Home screen with project loaded', url: '/' },
      { name: 'create-project-dialog', description: 'Create New Project dialog', action: 'dialog' },
      { name: 'book-configuration', description: 'Book Configuration', url: '/book' },
      { name: 'manuscript-management', description: 'Manuscript Management', url: '/manuscript' },
      { name: 'character-setup', description: 'Character Setup - Dossier', url: '/dossier' },
      { name: 'voice-casting', description: 'Voice Casting', url: '/casting' },
      { name: 'content-planning', description: 'Content Planning', url: '/planning' },
      { name: 'audio-production', description: 'Audio Production', url: '/voice' },
      { name: 'export-packaging', description: 'Export & Packaging', url: '/packaging' },
      { name: 'settings-configuration', description: 'Settings & Configuration', url: '/settings' }
    ];
  }

  async setupDirectories() {
    await fs.mkdir(this.screenshotDir, { recursive: true });
    
    for (const lang of this.languages) {
      const langDir = path.join(this.screenshotDir, lang.folder);
      await fs.mkdir(langDir, { recursive: true });
    }
  }

  async takeScreenshot(name, description) {
    try {
      console.log(`📸 ${description}`);
      
      // Take screenshot of entire screen (will capture the focused Electron window)
      const img = await screenshot({ format: 'png' });
      
      const filename = `${this.screenshotIndex.toString().padStart(2, '0')}-${name}.png`;
      const filepath = path.join(this.currentLangDir, filename);
      
      await fs.writeFile(filepath, img);
      
      console.log(`   ✅ Saved: ${filename}`);
      this.screenshotIndex++;
      
      // Wait a moment between screenshots
      await new Promise(resolve => setTimeout(resolve, 1500));
      return true;
    } catch (error) {
      console.error(`   ❌ Error taking screenshot: ${error.message}`);
      return false;
    }
  }

  async waitForUser(message) {
    console.log(message);
    return new Promise((resolve) => {
      process.stdin.once('data', () => resolve());
    });
  }

  async captureLanguageWorkflow(language) {
    console.log(`\n🌐 Starting ${language.name} screenshot capture...`);
    
    this.currentLangDir = path.join(this.screenshotDir, language.folder);
    this.screenshotIndex = 1;

    console.log('\n📋 SETUP CHECKLIST:');
    console.log(`   ✅ Khipu Studio Electron app is running`);
    console.log(`   ✅ test_7 project is loaded`);
    console.log(`   ✅ Language set to: ${language.name}`);
    console.log(`   ✅ Theme set to: Dark mode`);
    console.log(`   ✅ App window is visible and focused`);
    console.log('');

    await this.waitForUser(`📱 Ready to capture ${language.name} screenshots? Press ENTER...`);

    // Capture workflow screenshots
    for (const workflow of this.workflows) {
      if (workflow.action === 'dialog') {
        console.log(`\n🎯 ${workflow.description}:`);
        console.log('   1. Click "Create New Project" button');
        console.log('   2. Wait for dialog to appear');
        console.log('   3. Press ENTER to take screenshot...');
        await this.waitForUser('');
        await this.takeScreenshot(workflow.name, workflow.description);
        
        console.log('   4. Close/Cancel the dialog');
        console.log('   5. Press ENTER when dialog is closed...');
        await this.waitForUser('');
      } else if (workflow.url) {
        console.log(`\n🎯 ${workflow.description}:`);
        console.log(`   1. Navigate to: ${workflow.url}`);
        console.log('   2. Wait for page to load completely');
        console.log('   3. Press ENTER to take screenshot...');
        await this.waitForUser('');
        await this.takeScreenshot(workflow.name, workflow.description);
      }
    }

    console.log(`\n✅ ${language.name} screenshots completed!`);
    console.log(`📂 Saved in: ${language.folder}/`);
  }

  async automateAllLanguages() {
    console.log('🚀 KHIPU STUDIO USER GUIDE SCREENSHOT AUTOMATION');
    console.log('📚 Captures all 30 screenshots (10 per language) for documentation');
    console.log('🎯 Works with any Electron app - fully reusable system!');
    console.log('');
    console.log('⚡ FEATURES:');
    console.log('   • Automated screenshot capture');
    console.log('   • Multi-language support');
    console.log('   • Organized file structure');
    console.log('   • Step-by-step guidance');
    console.log('   • High-quality PNG output');
    console.log('');

    await this.setupDirectories();

    console.log('📋 INITIAL SETUP:');
    console.log('   1. Make sure Khipu Studio Electron app is running');
    console.log('   2. Open the test_7 project in the app');
    console.log('   3. Position the app window clearly visible');
    console.log('   4. Keep the app window focused during capture');
    console.log('');

    await this.waitForUser('🔥 Ready to start? Press ENTER...');

    // Capture each language
    for (let i = 0; i < this.languages.length; i++) {
      const language = this.languages[i];
      
      await this.captureLanguageWorkflow(language);
      
      // Prepare for next language
      if (i < this.languages.length - 1) {
        const nextLang = this.languages[i + 1];
        console.log('\n🔄 LANGUAGE CHANGE REQUIRED:');
        console.log(`   Next: ${nextLang.name}`);
        console.log('   1. Go to Settings in the app');
        console.log(`   2. Change language to: ${nextLang.name}`);
        console.log('   3. Return to home page');
        console.log('   4. Verify project is still loaded');
        console.log('');
        await this.waitForUser(`Ready for ${nextLang.name}? Press ENTER...`);
      }
    }

    console.log('\n🎉 ALL SCREENSHOTS COMPLETED!');
    console.log('📊 SUMMARY:');
    console.log(`   • Total screenshots: ${this.languages.length * this.workflows.length}`);
    console.log(`   • Languages: ${this.languages.length}`);
    console.log(`   • Screenshots per language: ${this.workflows.length}`);
    console.log('');
    console.log('📂 File Structure:');
    for (const lang of this.languages) {
      console.log(`   screenshots/${lang.folder}/`);
      console.log(`   ├── 01-home-with-project.png`);
      console.log(`   ├── 02-create-project-dialog.png`);
      console.log(`   ├── ...`);
      console.log(`   └── 10-settings-configuration.png`);
    }
    console.log('');
    console.log('✨ Screenshots are ready for User Guide documentation!');
    console.log('🔄 This script is reusable for any Electron app you develop!');
  }
}

// Run the automation
if (require.main === module) {
  const automator = new AutomatedElectronScreenshots();
  automator.automateAllLanguages().catch(console.error);
}

module.exports = AutomatedElectronScreenshots;