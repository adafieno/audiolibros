// electron/preload.cjs
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('khipu', {
  call: (ch, payload) => ipcRenderer.invoke(ch, payload),
  onJob: (cb) => ipcRenderer.on('job:event', (_e, data) => cb?.(data)),
  characters: {
    detect: (projectRoot) => ipcRenderer.invoke('characters:detect', { projectRoot }),
    assignToSegments: (projectRoot, payload) => ipcRenderer.invoke('characters:assignToSegments', { projectRoot, payload }),
    onProgress: (cb) => ipcRenderer.on('characters:detection:progress', (_e, data) => cb?.(data)),
    onLog: (cb) => ipcRenderer.on('characters:detection:log', (_e, data) => cb?.(data)),
    onAssignmentProgress: (cb) => ipcRenderer.on('characters:assignment:progress', (_e, data) => cb?.(data)),
  },
  fileExists: (filePath) => ipcRenderer.invoke("file:exists", filePath),
});
