const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('winova', {
  getSystemSnapshot: () => ipcRenderer.invoke('system:snapshot'),
  getSystemDetails: () => ipcRenderer.invoke('system:details'),
  readClipboard: () => ipcRenderer.invoke('clipboard:read'),
  writeClipboard: text => ipcRenderer.invoke('clipboard:write', text),
  hash: (text, algorithm) => ipcRenderer.invoke('utility:hash', { text, algorithm }),
  lookup: host => ipcRenderer.invoke('network:lookup', host),
  windowsAction: action => ipcRenderer.invoke('windows:action', action),
  openExternal: url => ipcRenderer.invoke('shell:openExternal', url),
  setTheme: theme => ipcRenderer.invoke('theme:set', theme),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateStatus: callback => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('update:status', listener);
    return () => ipcRenderer.removeListener('update:status', listener);
  }
});
