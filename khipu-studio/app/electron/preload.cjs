// electron/preload.cjs
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('khipu', {
  call: (ch, payload) => ipcRenderer.invoke(ch, payload),
  onJob: (cb) => {
    const listener = (_e, data) => cb?.(data);
    ipcRenderer.on('job:event', listener);
    return () => ipcRenderer.removeListener('job:event', listener);
  },
  characters: {
    detect: (projectRoot) => ipcRenderer.invoke('characters:detect', { projectRoot }),
    assignToSegments: (projectRoot, payload) => ipcRenderer.invoke('characters:assignToSegments', { projectRoot, payload }),
    onProgress: (cb) => {
      const listener = (_e, data) => cb?.(data);
      ipcRenderer.on('characters:detection:progress', listener);
      return () => ipcRenderer.removeListener('characters:detection:progress', listener);
    },
    onLog: (cb) => {
      const listener = (_e, data) => cb?.(data);
      ipcRenderer.on('characters:detection:log', listener);
      return () => ipcRenderer.removeListener('characters:detection:log', listener);
    },
    onAssignmentProgress: (cb) => {
      const listener = (_e, data) => cb?.(data);
      ipcRenderer.on('characters:assignment:progress', listener);
      return () => ipcRenderer.removeListener('characters:assignment:progress', listener);
    },
  },
  fileExists: (filePath) => ipcRenderer.invoke("file:exists", filePath),
  onAudioChaptersUpdated: (cb) => {
    if (audioChaptersListener) {
      audioChaptersListener(); // Remove the previous listener
      console.log('Previous listener removed for audio:chapters:updated');
    }

    const listener = (_e, data) => cb?.(data);
    ipcRenderer.on('audio:chapters:updated', listener);
    console.log('Listener added for audio:chapters:updated');

    // Store the unsubscribe function
    audioChaptersListener = () => {
      ipcRenderer.removeListener('audio:chapters:updated', listener);
      console.log('Listener removed for audio:chapters:updated');
    };

    return audioChaptersListener;
  },
});
