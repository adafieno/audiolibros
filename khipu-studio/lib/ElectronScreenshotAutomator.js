const { app, BrowserWindow, ipcMain } = require('electron');
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs').promises;

class ElectronScreenshotAutomator {
  constructor(options = {}) {
    this.screenshotDir = options.screenshotDir || './screenshots';
    this.languages = options.languages || ['en-US'];
    this.theme = options.theme || 'dark';
    this.projectPath = options.projectPath || null;
    this.workflows = options.workflows || [];
    this.mainWindow = null;
    this.screenshotIndex = 1;
  }

  async initialize() {
    // Ensure screenshot directory exists
    await fs.mkdir(this.screenshotDir, { recursive: true });
    
    // Wait for Electron app to be ready
    if (app) {
      await app.whenReady();
    }
  }

  async findElectronWindow() {
    // Try to find the main Electron window
    const windows = require('electron').BrowserWindow.getAllWindows();
    return windows.length > 0 ? windows[0] : null;
  }

  async setupLanguageAndTheme(language) {
    if (!this.mainWindow) return false;
    
    try {
      // Execute JavaScript in the Electron renderer process
      await this.mainWindow.webContents.executeJavaScript(`
        // Set language
        localStorage.setItem('khipu.lang', '${language}');
        
        // Set theme
        document.documentElement.setAttribute('data-theme', '${this.theme}');
        
        // Reload to apply changes
        window.location.reload();
      `);
      
      // Wait for reload
      await new Promise(resolve => setTimeout(resolve, 3000));
      return true;
    } catch (error) {
      console.error('Error setting up language/theme:', error);
      return false;
    }
  }

  async loadProject() {
    if (!this.mainWindow || !this.projectPath) return false;
    
    try {
      // Call the project open function directly in the renderer
      const result = await this.mainWindow.webContents.executeJavaScript(`
        (async () => {
          try {
            if (window.khipu) {
              await window.khipu.call("project:open", { path: "${this.projectPath.replace(/\\/g, '\\\\')}" });
              return true;
            }
            return false;
          } catch (error) {
            console.error('Error loading project:', error);
            return false;
          }
        })()
      `);
      
      if (result) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        return true;
      }
    } catch (error) {
      console.error('Error in loadProject:', error);
    }
    
    return false;
  }

  async takeScreenshot(name, description, url = null) {
    if (!this.mainWindow) {
      console.error('No main window available for screenshot');
      return false;
    }

    try {
      // Navigate if URL provided
      if (url) {
        await this.mainWindow.webContents.executeJavaScript(`
          window.location.href = '${url}';
        `);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Take screenshot using Electron's native method
      const image = await this.mainWindow.webContents.capturePage();
      const filename = `${this.screenshotIndex.toString().padStart(2, '0')}-${name}.png`;
      const filepath = path.join(this.screenshotDir, filename);
      
      await fs.writeFile(filepath, image.toPNG());
      
      console.log(`📸 ${description}`);
      console.log(`   ✅ Saved: ${filename}`);
      
      this.screenshotIndex++;
      await new Promise(resolve => setTimeout(resolve, 1500));
      return true;
    } catch (error) {
      console.error(`Error taking screenshot ${name}:`, error);
      return false;
    }
  }

  async triggerDialog(selector) {
    if (!this.mainWindow) return false;
    
    try {
      await this.mainWindow.webContents.executeJavaScript(`
        const buttons = Array.from(document.querySelectorAll('${selector}'));
        const targetButton = buttons.find(btn => 
          btn.textContent && 
          (btn.textContent.includes('Create New') || 
           btn.textContent.includes('Crear nuevo') ||
           btn.textContent.includes('Criar novo'))
        );
        if (targetButton) {
          targetButton.click();
        }
      `);
      await new Promise(resolve => setTimeout(resolve, 1000));
      return true;
    } catch (error) {
      console.error('Error triggering dialog:', error);
      return false;
    }
  }

  async closeDialog() {
    if (!this.mainWindow) return false;
    
    try {
      await this.mainWindow.webContents.executeJavaScript(`
        const cancelBtn = Array.from(document.querySelectorAll('button')).find(btn => 
          btn.textContent && (btn.textContent.includes('Cancel') || btn.textContent.includes('Cancelar'))
        );
        if (cancelBtn) cancelBtn.click();
      `);
      await new Promise(resolve => setTimeout(resolve, 1000));
      return true;
    } catch (error) {
      console.error('Error closing dialog:', error);
      return false;
    }
  }

  async captureWorkflowScreenshots(language, workflows) {
    console.log(`🌐 Capturing screenshots for ${language}...`);
    
    // Create language-specific directory
    const langDir = path.join(this.screenshotDir, `user-guide-${language.toLowerCase().replace('_', '-')}`);
    await fs.mkdir(langDir, { recursive: true });
    this.screenshotDir = langDir;
    this.screenshotIndex = 1;

    // Find Electron window
    this.mainWindow = await this.findElectronWindow();
    if (!this.mainWindow) {
      console.error('❌ No Electron window found');
      return false;
    }

    // Setup language and theme
    console.log(`🌐 Setting up ${language} with ${this.theme} theme...`);
    await this.setupLanguageAndTheme(language);

    // Load project if specified
    if (this.projectPath) {
      console.log(`📁 Loading project: ${this.projectPath}`);
      await this.loadProject();
    }

    // Execute workflow screenshots
    for (const workflow of workflows) {
      try {
        if (workflow.type === 'screenshot') {
          await this.takeScreenshot(workflow.name, workflow.description, workflow.url);
        } else if (workflow.type === 'dialog') {
          await this.triggerDialog(workflow.selector);
          await this.takeScreenshot(workflow.name, workflow.description);
          await this.closeDialog();
        }
      } catch (error) {
        console.error(`Error in workflow step ${workflow.name}:`, error);
      }
    }

    console.log(`✅ ${language} screenshots completed!`);
    return true;
  }

  async captureAllLanguages() {
    console.log('🚀 Starting automated Electron screenshot capture...');
    
    await this.initialize();

    for (const language of this.languages) {
      await this.captureWorkflowScreenshots(language, this.workflows);
      
      // Reset for next language
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('🎉 All screenshots completed!');
  }
}

module.exports = ElectronScreenshotAutomator;