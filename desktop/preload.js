const { contextBridge, ipcRenderer } = require('electron');

let currentBackendUrl = 'http://127.0.0.1:8000';
try {
  const syncInfo = ipcRenderer.sendSync('get-backend-info-sync');
  if (syncInfo && syncInfo.url) {
    currentBackendUrl = syncInfo.url;
  }
} catch (e) {
  // Fallback to default
}

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  isDesktop: true,
  platform: process.platform,
  getBackendUrl: () => currentBackendUrl,
  getVersion: () => '1.0.0',
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  getAppPaths: () => ipcRenderer.invoke('get-app-paths'),
  getBackendInfo: () => ipcRenderer.invoke('get-backend-info'),
  openLogFile: () => ipcRenderer.invoke('open-log-file'),
  openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),
  restartBackend: () => ipcRenderer.invoke('restart-backend'),
  onBackendStatus: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('backend-status', handler);
    return () => ipcRenderer.removeListener('backend-status', handler);
  },
});

window.__SADARAKSHAK_IS_DESKTOP__ = true;
window.__SADARAKSHAK_BACKEND_URL__ = currentBackendUrl;
