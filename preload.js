const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('voldenaAPI', {
  getRules: () => ipcRenderer.invoke('get-rules'),
  addRule: (rule) => ipcRenderer.invoke('add-rule', rule),
  updateRule: (id, rule) => ipcRenderer.invoke('update-rule', id, rule),
  deleteRule: (id) => ipcRenderer.invoke('delete-rule', id),

  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSettings: (settings) => ipcRenderer.invoke('update-settings', settings),

  getProtectedApps: () => ipcRenderer.invoke('get-protected-apps'),
  updateProtectedApps: (apps) => ipcRenderer.invoke('update-protected-apps', apps),

  getMemoryStats: () => ipcRenderer.invoke('get-memory-stats'),
  getDetailedProcesses: () => ipcRenderer.invoke('get-detailed-processes'),
  optimizeRam: (level) => ipcRenderer.invoke('optimize-ram', level),
  
  stopExplorer: () => ipcRenderer.invoke('stop-explorer'),
  startExplorer: () => ipcRenderer.invoke('start-explorer'),

  getRunningProcesses: () => ipcRenderer.invoke('get-running-processes'),
  getStatus: () => ipcRenderer.invoke('get-status'),
  selectFile: () => ipcRenderer.invoke('select-file'),

  // Window Controls
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),

  // Event Listeners
  onStatusChange: (callback) => {
    ipcRenderer.on('status-changed', (event, data) => callback(data));
  },
  onMemoryUpdate: (callback) => {
    ipcRenderer.on('memory-update', (event, data) => callback(data));
  }
});
