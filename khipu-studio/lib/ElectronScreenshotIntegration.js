const { ipcMain } = require('electron');
const ElectronScreenshotAutomator = require('../lib/ElectronScreenshotAutomator');

/**
 * Electron Screenshot Integration
 * Add this to your main Electron process to enable automated screenshots
 */
class ElectronScreenshotIntegration {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.setupIPC();
  }

  setupIPC() {
    // IPC handler for starting screenshot automation
    ipcMain.handle('screenshot:start', async (event, config) => {
      try {
        const automator = new ElectronScreenshotAutomator({
          ...config,
          mainWindow: this.mainWindow
        });
        
        await automator.captureAllLanguages();
        return { success: true };
      } catch (error) {
        console.error('Screenshot automation error:', error);
        return { success: false, error: error.message };
      }
    });

    // IPC handler for taking single screenshot
    ipcMain.handle('screenshot:capture', async (event, options) => {
      try {
        const automator = new ElectronScreenshotAutomator({
          screenshotDir: options.dir || './screenshots',
          mainWindow: this.mainWindow
        });
        
        const success = await automator.takeScreenshot(
          options.name, 
          options.description, 
          options.url
        );
        
        return { success };
      } catch (error) {
        console.error('Single screenshot error:', error);
        return { success: false, error: error.message };
      }
    });

    // IPC handler for setting up test environment
    ipcMain.handle('screenshot:setup', async (event, options) => {
      try {
        const automator = new ElectronScreenshotAutomator({
          mainWindow: this.mainWindow
        });
        
        if (options.language) {
          await automator.setupLanguageAndTheme(options.language);
        }
        
        if (options.projectPath) {
          await automator.loadProject();
        }
        
        return { success: true };
      } catch (error) {
        console.error('Screenshot setup error:', error);
        return { success: false, error: error.message };
      }
    });
  }

  // Method to add screenshot menu item (optional)
  addScreenshotMenu(Menu) {
    const screenshotMenu = {
      label: 'Screenshots',
      submenu: [
        {
          label: 'Capture Current Page',
          accelerator: 'Ctrl+Shift+S',
          click: async () => {
            const result = await this.mainWindow.webContents.executeJavaScript(`
              window.electronAPI?.screenshot?.capture({
                name: 'manual-capture',
                description: 'Manual screenshot capture'
              });
            `);
            console.log('Manual screenshot result:', result);
          }
        },
        {
          label: 'Start Full Automation',
          click: async () => {
            const result = await this.mainWindow.webContents.executeJavaScript(`
              window.electronAPI?.screenshot?.start({
                languages: ['en-US', 'es-PE', 'pt-BR'],
                theme: 'dark',
                projectPath: 'C:\\\\code\\\\audiolibros\\\\khipu-studio\\\\reference-code\\\\test_7'
              });
            `);
            console.log('Full automation result:', result);
          }
        }
      ]
    };

    return screenshotMenu;
  }
}

module.exports = ElectronScreenshotIntegration;