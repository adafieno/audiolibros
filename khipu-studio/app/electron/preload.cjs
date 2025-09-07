// electron/preload.cjs
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('khipu', {
  call: (ch, payload) => ipcRenderer.invoke(ch, payload),
  onJob: (cb) => ipcRenderer.on('job:event', (_e, data) => cb?.(data)),
  characters: {
    detect: (projectRoot) => ipcRenderer.invoke('characters:detect', { projectRoot }),
  },
});
