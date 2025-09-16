const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs').promises;

// Language configurations for localized screenshots
const LANGUAGE_CONFIGS = {
  'en-US': {
    name: 'English (US)',
    projectName: 'mystery-novel-demo',
    bookTitle: 'Puntajada',
    bookSubtitle: 'Ancestral Mysteries',
    author: 'Agustín Da Fieno Delucchi',
    description: 'The town slept with its eyes open. When Lucia returns to Puntajada after her brother Rafa\'s disappearance, she finds a place she no longer recognizes...',
    screenshotPrefix: 'en-us'
  },
  'es-PE': {
    name: 'Español (Perú)', 
    projectName: 'puntajada-demo',
    bookTitle: 'Puntajada',
    bookSubtitle: 'Misterios ancestrales',
    author: 'Agustín Da Fieno Delucchi',
    description: 'El pueblo dormía con los ojos abiertos. Cuando Lucía regresa a Puntajada tras la desaparición de su hermano Rafa, encuentra un lugar que ya no reconoce...',
    screenshotPrefix: 'es-pe'
  },
  'pt-BR': {
    name: 'Português (Brasil)',
    projectName: 'puntajada-demo-pt',
    bookTitle: 'Puntajada',
    bookSubtitle: 'Mistérios Ancestrais',
    author: 'Agustín Da Fieno Delucchi', 
    description: 'A cidade dormia com os olhos abertos. Quando Lucia retorna a Puntajada após o desaparecimento de seu irmão Rafa, ela encontra um lugar que não reconhece mais...',
    screenshotPrefix: 'pt-br'
  }
};

async function copyReferenceProject(targetPath, language) {
  console.log(`📁 Copying reference project for ${language}...`);
  
  const sourcePath = path.join(__dirname, 'reference-code', 'test_7');
  
  try {
    // Create target directory
    await fs.mkdir(targetPath, { recursive: true });
    
    // Copy entire reference project structure
    await copyDirectory(sourcePath, targetPath);
    
    // Update book.meta.json for the specific language
    const config = LANGUAGE_CONFIGS[language];
    const bookMetaPath = path.join(targetPath, 'book.meta.json');
    
    let bookMeta = JSON.parse(await fs.readFile(bookMetaPath, 'utf8'));
    bookMeta.title = config.bookTitle;
    bookMeta.subtitle = config.bookSubtitle;
    bookMeta.authors = [config.author];
    bookMeta.language = language;
    bookMeta.description = config.description;
    
    await fs.writeFile(bookMetaPath, JSON.stringify(bookMeta, null, 2));
    
    console.log(`✅ Reference project copied and localized for ${language}`);
  } catch (error) {
    console.error(`❌ Error copying reference project:`, error);
    throw error;
  }
}

async function copyDirectory(src, dest) {
  const entries = await fs.readdir(src, { withFileTypes: true });
  
  await fs.mkdir(dest, { recursive: true });
  
  for (let entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

async function captureLanguageScreenshots(language) {
  console.log(`🚀 Starting ${language} screenshot capture for Khipu Studio User Guide...`);
  
  const config = LANGUAGE_CONFIGS[language];
  const screenshotsDir = path.join(__dirname, 'screenshots', `user-guide-${config.screenshotPrefix}`);
  
  try {
    await fs.mkdir(screenshotsDir, { recursive: true });
  } catch (err) {
    // Directory already exists
  }

  // Launch the Electron app
  const electronApp = await electron.launch({
    args: [path.join(__dirname, 'app')],
    executablePath: path.join(__dirname, 'app', 'node_modules', 'electron', 'dist', 'electron.exe'),
    env: {
      ...process.env,
      VITE_DEV: '1'
    }
  });

  const window = await electronApp.firstWindow();
  await window.waitForLoadState('networkidle');
  await window.waitForTimeout(3000); // Give extra time for app initialization

  let screenshotIndex = 1;

  async function takeScreenshot(name, description, options = {}) {
    const filename = `${screenshotIndex.toString().padStart(2, '0')}-${name}.png`;
    const fullPath = path.join(screenshotsDir, filename);
    
    console.log(`📸 [${language}] ${description}`);
    
    await window.screenshot({ 
      path: fullPath,
      fullPage: true,
      ...options
    });
    
    console.log(`   💾 Saved: ${filename}`);
    screenshotIndex++;
    await window.waitForTimeout(1500);
  }

  try {
    // === User Guide Section 1: Getting Started ===
    
    // 1. Home screen - fresh start
    await takeScreenshot('home-empty', 'Clean home screen (Getting Started)');
    
    // 2. Create New Project Dialog
    await window.click('text=Create New Project');
    await window.waitForTimeout(1000);
    await takeScreenshot('create-project-dialog', 'Create New Project dialog');
    
    // 3. Fill project creation form
    const tempProjectPath = path.join('C:', 'temp', 'khipu-demo', language);
    await window.fill('input[placeholder*="parent"]', 'C:\\temp\\khipu-demo');
    await window.fill('input[placeholder*="name"], input[placeholder*="project"]', config.projectName);
    await takeScreenshot('create-project-filled', 'Project creation form filled');
    
    // Create the project
    await window.click('text=Create Project');
    await window.waitForTimeout(4000);
    
    // Copy our reference project to the created location
    try {
      await copyReferenceProject(path.join(tempProjectPath, config.projectName), language);
    } catch (error) {
      console.warn('Could not copy reference project, continuing with empty project');
    }
    
    // === User Guide Section 2: Book Configuration ===
    
    // 4. Book Configuration Page
    await takeScreenshot('book-config-page', 'Book Configuration page');
    
    // 5. Fill book metadata
    await window.fill('input[placeholder*="title"], input[value=""]', config.bookTitle);
    await window.fill('input[placeholder*="subtitle"]', config.bookSubtitle);
    
    // Add author
    try {
      await window.click('text=Add Author');
      await window.waitForTimeout(500);
      await window.fill('input[placeholder*="author"]', config.author);
    } catch (e) {
      console.log('Author field handling different than expected');
    }
    
    // Select language
    try {
      await window.click('select');
      await window.selectOption('select', language);
    } catch (e) {
      console.log('Language selector different than expected');
    }
    
    await takeScreenshot('book-config-filled', 'Book metadata filled');
    
    // === User Guide Section 3: Manuscript Management ===
    
    // 6. Navigate to Manuscript
    await window.click('[href="/manuscript"], text=Manuscript');
    await window.waitForTimeout(2000);
    await takeScreenshot('manuscript-page', 'Manuscript management page');
    
    // 7. Show chapter list if available
    try {
      // If chapters are loaded from reference project
      await takeScreenshot('manuscript-chapters-loaded', 'Manuscript with chapters loaded');
    } catch (e) {
      console.log('No chapters loaded in manuscript view');
    }
    
    // === User Guide Section 4: Character Management (Dossier) ===
    
    // 8. Navigate to Dossier
    try {
      await window.click('[href="/dossier"], text=Dossier');
      await window.waitForTimeout(2000);
      await takeScreenshot('dossier-page', 'Character dossier page');
      
      // 9. Add character dialog
      try {
        await window.click('text=Add Character');
        await window.waitForTimeout(1000);
        await takeScreenshot('dossier-add-character', 'Add character dialog');
        
        // Close dialog
        await window.press('Escape');
      } catch (e) {
        console.log('Add character not available');
      }
      
    } catch (e) {
      console.log('⚠️  Dossier page not accessible (workflow locked)');
    }
    
    // === User Guide Section 5: Voice Casting ===
    
    // 10. Navigate to Casting
    try {
      await window.click('[href="/casting"], text=Casting');
      await window.waitForTimeout(2000);
      await takeScreenshot('casting-page', 'Voice casting page');
      
      // 11. Voice selection interface
      try {
        await window.click('text=Choose Voice, text=Select Voice');
        await window.waitForTimeout(1000);
        await takeScreenshot('voice-selection', 'Voice selection interface');
        
        // Close dialog
        await window.press('Escape');
      } catch (e) {
        console.log('Voice selection not available');
      }
      
    } catch (e) {
      console.log('⚠️  Casting page not accessible (workflow locked)');
    }
    
    // === User Guide Section 6: Content Planning ===
    
    // 12. Navigate to Planning
    try {
      await window.click('[href="/planning"], text=Planning');
      await window.waitForTimeout(2000);
      await takeScreenshot('planning-page', 'Content planning page');
      
      // 13. Plan generation
      try {
        await window.click('text=Generate Plan');
        await window.waitForTimeout(2000);
        await takeScreenshot('planning-generated', 'Generated content plan');
      } catch (e) {
        console.log('Plan generation not available');
      }
      
    } catch (e) {
      console.log('⚠️  Planning page not accessible (workflow locked)');
    }
    
    // === User Guide Section 7: Audio Production ===
    
    // 14. Navigate to Voice/Audio Production
    try {
      await window.click('[href="/voice"], text=Voice');
      await window.waitForTimeout(2000);
      await takeScreenshot('audio-production-page', 'Audio production page');
      
      // 15. Audio processing controls
      try {
        await takeScreenshot('audio-processing-controls', 'Audio processing controls');
      } catch (e) {
        console.log('Audio processing not visible');
      }
      
    } catch (e) {
      console.log('⚠️  Voice page not accessible (workflow locked)');
    }
    
    // === User Guide Section 8: Export and Packaging ===
    
    // 16. Navigate to Packaging
    try {
      await window.click('[href="/packaging"], text=Packaging');
      await window.waitForTimeout(2000);
      await takeScreenshot('packaging-page', 'Export and packaging page');
      
    } catch (e) {
      console.log('⚠️  Packaging page not accessible (workflow locked)');
    }
    
    // === User Guide Section 9: Settings ===
    
    // 17. Navigate to Settings
    await window.click('[href="/settings"], text=Settings');
    await window.waitForTimeout(2000);
    await takeScreenshot('settings-page', 'Settings and configuration');
    
    // 18. Settings sections
    try {
      await takeScreenshot('settings-api-credentials', 'API credentials section');
    } catch (e) {
      console.log('Settings sections not clearly visible');
    }
    
    // === User Guide Section 10: Navigation and Workflow ===
    
    // 19. Navigate back to Home to show project in recent list
    await window.click('[href="/"], text=Home');
    await window.waitForTimeout(2000);
    await takeScreenshot('home-with-project', 'Home with created project in recent list');
    
    // 20. Final overview - navigate to Project overview if available
    try {
      await window.click('[href="/project"], text=Project');
      await window.waitForTimeout(2000);
      await takeScreenshot('project-overview', 'Project overview page');
    } catch (e) {
      console.log('Project overview not available');
    }
    
    console.log(`✅ [${language}] Screenshot capture completed!`);
    console.log(`📁 Screenshots saved in: ${screenshotsDir}`);
    
  } catch (error) {
    console.error(`❌ [${language}] Error during screenshot capture:`, error);
  } finally {
    await electronApp.close();
    await window.waitForTimeout(2000); // Give time for cleanup
  }
}

async function captureAllLanguages() {
  console.log('🌍 Starting multi-language screenshot capture for User Guide...');
  console.log('📖 This will create screenshots aligned with the User Guide sections\n');
  
  const languages = Object.keys(LANGUAGE_CONFIGS);
  
  for (let i = 0; i < languages.length; i++) {
    const language = languages[i];
    console.log(`\n🔄 Processing language ${i + 1}/${languages.length}: ${LANGUAGE_CONFIGS[language].name}`);
    
    try {
      await captureLanguageScreenshots(language);
      
      if (i < languages.length - 1) {
        console.log('⏳ Waiting between language captures...');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      
    } catch (error) {
      console.error(`❌ Failed to capture screenshots for ${language}:`, error);
      console.log('⏭️  Continuing with next language...\n');
    }
  }
  
  console.log('\n🎉 All language screenshot captures completed!');
  console.log('📁 Check the screenshots/ folder for organized results:');
  
  for (const language of languages) {
    const config = LANGUAGE_CONFIGS[language];
    console.log(`   - screenshots/user-guide-${config.screenshotPrefix}/ (${config.name})`);
  }
  
  console.log('\n📋 Screenshots are organized to match User Guide sections:');
  console.log('   01-05: Getting Started & Project Setup');
  console.log('   06-08: Book Configuration'); 
  console.log('   09-11: Manuscript Management');
  console.log('   12-14: Character Management');
  console.log('   15-17: Voice Casting & Planning');
  console.log('   18-20: Audio Production & Export');
  console.log('   21+: Settings & Navigation');
}

// Run the multi-language screenshot capture
captureAllLanguages().catch(console.error);