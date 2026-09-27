const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('winova', {
  getSystemSnapshot: () => ipcRenderer.invoke('system:snapshot'),
  getSystemDetails: () => ipcRenderer.invoke('system:details'),
  readClipboard: () => ipcRenderer.invoke('clipboard:read'),
  writeClipboard: text => ipcRenderer.invoke('clipboard:write', text),
  hash: (text, algorithm) => ipcRenderer.invoke('utility:hash', { text, algorithm }),
  lookup: host => ipcRenderer.invoke('network:lookup', host),
  getNetworkAdapters: () => ipcRenderer.invoke('network:adapters'),
  getNetworkServiceStatus: () => ipcRenderer.invoke('network:service-status'),
  runNetworkHealth: () => ipcRenderer.invoke('network:health'),
  repairNetwork: (action, name) => ipcRenderer.invoke('network:repair', { action, name }),
  toggleNetworkAdapter: (name, enabled) => ipcRenderer.invoke('network:toggle-adapter', { name, enabled }),
  windowsAction: action => ipcRenderer.invoke('windows:action', action),
  openExternal: url => ipcRenderer.invoke('shell:openExternal', url),
  checksumFile: algorithm => ipcRenderer.invoke('file:checksum', algorithm),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateStatus: callback => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('update:status', listener);
    return () => ipcRenderer.removeListener('update:status', listener);
  }
});
