const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs').promises;

// Single language test configuration
const TEST_CONFIG = {
  language: 'es-PE',
  name: 'Español (Perú)', 
  projectName: 'puntajada-demo-test',
  bookTitle: 'Puntajada',
  bookSubtitle: 'Misterios ancestrales',
  author: 'Agustín Da Fieno Delucchi',
  description: 'El pueblo dormía con los ojos abiertos...',
  screenshotPrefix: 'test-es-pe'
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
    const bookMetaPath = path.join(targetPath, 'book.meta.json');
    
    let bookMeta = JSON.parse(await fs.readFile(bookMetaPath, 'utf8'));
    bookMeta.title = TEST_CONFIG.bookTitle;
    bookMeta.subtitle = TEST_CONFIG.bookSubtitle;
    bookMeta.authors = [TEST_CONFIG.author];
    bookMeta.language = language;
    bookMeta.description = TEST_CONFIG.description;
    
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

async function captureTestScreenshots() {
  console.log(`🚀 Testing screenshot capture for ${TEST_CONFIG.name}...`);
  
  const screenshotsDir = path.join(__dirname, 'screenshots', `${TEST_CONFIG.screenshotPrefix}`);
  
  try {
    await fs.mkdir(screenshotsDir, { recursive: true });
  } catch (err) {
    // Directory already exists
  }

  // Launch the Electron app
  const electronApp = await electron.launch({
    args: [path.join(__dirname, 'app')],
    executablePath: path.join(__dirname, 'app', 'node_modules', 'electron', 'dist', 'electron.exe')
    // Don't set env variables to avoid conflicts with running dev server
  });

  const window = await electronApp.firstWindow();
  await window.waitForLoadState('networkidle');
  
  // Wait for React to fully initialize
  console.log('⏳ Waiting for React app to initialize...');
  await window.waitForTimeout(5000); // Longer wait for React app
  
  // Wait for specific content to appear that indicates the app is ready
  try {
    await window.waitForSelector('text="Existing Projects" >> visible=true', { timeout: 10000 });
    console.log('✅ App initialized - found "Existing Projects" text');
  } catch {
    console.log('⚠️  Could not find "Existing Projects" text, continuing anyway');
  }

  let screenshotIndex = 1;

  async function takeScreenshot(name, description) {
    const filename = `${screenshotIndex.toString().padStart(2, '0')}-${name}.png`;
    const fullPath = path.join(screenshotsDir, filename);
    
    console.log(`📸 ${description}`);
    
    await window.screenshot({ 
      path: fullPath,
      fullPage: true
    });
    
    console.log(`   💾 Saved: ${filename}`);
    screenshotIndex++;
    await window.waitForTimeout(1500);
  }

  try {
    // 1. Home screen
    await takeScreenshot('home-empty', 'Clean home screen');
    
    // 2. Create project - with improved button detection
    console.log('🔍 Looking for Create New Project button...');
    
    // Wait for the app UI to fully render
    await window.waitForTimeout(2000);
    
    // First, let's check if React has rendered anything
    const reactCheck = await window.evaluate(() => {
      const reactRoot = document.getElementById('root');
      return {
        hasReactRoot: !!reactRoot,
        reactRootHasContent: reactRoot ? reactRoot.innerHTML.length > 100 : false,
        bodyText: document.body.textContent?.substring(0, 200),
        allText: document.documentElement.textContent?.substring(0, 500)
      };
    });
    console.log('React status:', reactCheck);
    
    // Try multiple approaches to find and click the button
    let clicked = false;
    const strategies = [
      { selector: 'text=Create New Project', name: 'Text selector (English)' },
      { selector: 'text=Crear nuevo proyecto', name: 'Text selector (Spanish)' },
      { selector: 'button:has-text("Create New Project")', name: 'Button with English text' },
      { selector: 'button:has-text("Crear nuevo proyecto")', name: 'Button with Spanish text' },
      { selector: 'button:has-text("Create")', name: 'Button containing "Create"' },
      { selector: 'button:has-text("Crear")', name: 'Button containing "Crear"' },
      { selector: '[role="button"]', name: 'Elements with button role' },
      { selector: 'button', name: 'Any button element' }
    ];
    
    for (const strategy of strategies) {
      try {
        console.log(`   Trying: ${strategy.name}`);
        
        // Check if element exists
        const element = await window.$(strategy.selector);
        if (element) {
          // Get the button text to verify
          const buttonText = await element.textContent();
          console.log(`   Found button with text: "${buttonText}"`);
          
          // If it looks like a create button, click it
          if (buttonText && (buttonText.includes('Create') || buttonText.includes('Crear'))) {
            await element.click();
            clicked = true;
            console.log(`   ✅ Successfully clicked using: ${strategy.name}`);
            break;
          }
        }
      } catch (error) {
        console.log(`   ❌ ${strategy.name} failed: ${error.message}`);
      }
    }
    
    if (!clicked) {
      console.log('⚠️  Could not find Create New Project button, analyzing page:');
      
      // Check for all clickable elements
      const clickables = await window.$$eval('*[onclick], *[role="button"], button, a, input[type="button"], input[type="submit"]', elements => 
        elements.map(el => ({ 
          tagName: el.tagName,
          text: el.textContent?.trim(), 
          className: el.className, 
          id: el.id,
          role: el.getAttribute('role'),
          visible: el.offsetParent !== null,
          onclick: el.hasAttribute('onclick')
        }))
      );
      console.log('All clickable elements:', clickables);
      
      // Also check for any divs with text containing "Create"
      const createElements = await window.$$eval('*', elements => 
        elements
          .filter(el => el.textContent && el.textContent.includes('Create'))
          .map(el => ({ 
            tagName: el.tagName,
            text: el.textContent?.trim(), 
            className: el.className, 
            id: el.id,
            visible: el.offsetParent !== null
          }))
      );
      console.log('Elements containing "Create":', createElements);
      
      // Take a debug screenshot
      await takeScreenshot('debug-no-button-found', 'Debug: Could not find create button');
      return;
    }
    
    await window.waitForTimeout(1000);
    await takeScreenshot('create-project-dialog', 'Create project dialog');
    
    // 3. Fill and create project
    await window.fill('input[placeholder*="parent"]', 'C:\\temp\\khipu-test');
    await window.fill('input[placeholder*="name"], input[placeholder*="project"]', TEST_CONFIG.projectName);
    await takeScreenshot('create-project-filled', 'Project form filled');
    
    await window.click('text=Create Project');
    await window.waitForTimeout(4000);
    
    // Copy reference project
    try {
      const projectPath = path.join('C:', 'temp', 'khipu-test', TEST_CONFIG.projectName);
      await copyReferenceProject(projectPath, TEST_CONFIG.language);
    } catch (error) {
      console.warn('Could not copy reference project');
    }
    
    // 4. Book page
    await takeScreenshot('book-config-page', 'Book configuration page');
    
    // 5. Manuscript page
    await window.click('[href="/manuscript"], text=Manuscript');
    await window.waitForTimeout(2000);
    await takeScreenshot('manuscript-page', 'Manuscript page');
    
    // 6. Settings page
    await window.click('[href="/settings"], text=Settings');
    await window.waitForTimeout(2000);
    await takeScreenshot('settings-page', 'Settings page');
    
    // 7. Back to home
    await window.click('[href="/"], text=Home');
    await window.waitForTimeout(2000);
    await takeScreenshot('home-with-project', 'Home with project');
    
    console.log(`✅ Test screenshot capture completed!`);
    console.log(`📁 Screenshots saved in: ${screenshotsDir}`);
    
  } catch (error) {
    console.error(`❌ Error during test screenshot capture:`, error);
  } finally {
    await electronApp.close();
  }
}

// Run the test
captureTestScreenshots().catch(console.error);