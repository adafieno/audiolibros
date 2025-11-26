const ElectronScreenshotAutomator = require('./lib/ElectronScreenshotAutomator');

// Configuration for Khipu Studio User Guide screenshots
const khipuStudioConfig = {
  screenshotDir: './screenshots',
  languages: ['en-US', 'es-PE', 'pt-BR'],
  theme: 'dark',
  projectPath: 'C:\\code\\audiolibros\\khipu-studio\\reference-code\\test_7',
  workflows: [
    // Getting Started Section
    {
      type: 'screenshot',
      name: 'home-with-project',
      description: 'Getting Started: Home screen with project loaded',
      url: '/'
    },
    
    // Quick Start Workflow - Create Dialog
    {
      type: 'dialog',
      name: 'create-project-dialog',
      description: 'Step 1: Create New Project dialog',
      selector: 'button'
    },
    
    // Workflow Pages
    {
      type: 'screenshot',
      name: 'book-configuration',
      description: 'Step 2: Book Configuration',
      url: '/book'
    },
    {
      type: 'screenshot',
      name: 'manuscript-management',
      description: 'Step 3: Manuscript Management',
      url: '/manuscript'
    },
    {
      type: 'screenshot',
      name: 'character-setup',
      description: 'Step 4: Character Setup - Dossier',
      url: '/dossier'
    },
    {
      type: 'screenshot',
      name: 'voice-casting',
      description: 'Step 5: Voice Casting',
      url: '/casting'
    },
    {
      type: 'screenshot',
      name: 'content-planning',
      description: 'Step 6: Content Planning',
      url: '/planning'
    },
    {
      type: 'screenshot',
      name: 'audio-production',
      description: 'Step 7: Audio Production',
      url: '/voice'
    },
    {
      type: 'screenshot',
      name: 'export-packaging',
      description: 'Step 8: Export & Packaging',
      url: '/packaging'
    },
    
    // Navigation Guide
    {
      type: 'screenshot',
      name: 'settings-configuration',
      description: 'Settings & Configuration',
      url: '/settings'
    }
  ]
};

async function main() {
  console.log('🎯 Khipu Studio User Guide Screenshot Automation');
  console.log('📚 Fully automated - captures 30 screenshots (10 per language)');
  console.log('🖥️  Works directly with Electron app');
  console.log('⚡ Configurable and reusable for any Electron app');
  console.log('');

  const automator = new ElectronScreenshotAutomator(khipuStudioConfig);
  
  try {
    await automator.captureAllLanguages();
  } catch (error) {
    console.error('❌ Screenshot automation failed:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { khipuStudioConfig, ElectronScreenshotAutomator };