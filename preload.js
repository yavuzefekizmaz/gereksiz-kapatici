const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('voldenaAPI', {
  // Rules
  getRules: () => ipcRenderer.invoke('get-rules'),
  addRule: (rule) => ipcRenderer.invoke('add-rule', rule),
  updateRule: (id, rule) => ipcRenderer.invoke('update-rule', id, rule),
  deleteRule: (id) => ipcRenderer.invoke('delete-rule', id),

  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSettings: (settings) => ipcRenderer.invoke('update-settings', settings),

  // Whitelist
  getProtectedApps: () => ipcRenderer.invoke('get-protected-apps'),
  updateProtectedApps: (apps) => ipcRenderer.invoke('update-protected-apps', apps),

  // Game Detection & Libraries
  scanGameLibraries: () => ipcRenderer.invoke('scan-game-libraries'),
  getDiscoveredGames: () => ipcRenderer.invoke('get-discovered-games'),
  addCustomGamePath: (targetPath) => ipcRenderer.invoke('add-custom-game-path', targetPath),
  removeCustomGamePath: (targetPath) => ipcRenderer.invoke('remove-custom-game-path', targetPath),
  getCustomGamePaths: () => ipcRenderer.invoke('get-custom-game-paths'),
  saveVerifiedGames: (games) => ipcRenderer.invoke('save-verified-games', games),
  selectFolder: () => ipcRenderer.invoke('select-folder'),

  // Memory & RAM Optimization
  getMemoryStats: () => ipcRenderer.invoke('get-memory-stats'),
  getDetailedProcesses: () => ipcRenderer.invoke('get-detailed-processes'),
  optimizeRam: (level) => ipcRenderer.invoke('optimize-ram', level),
  
  // Explorer
  stopExplorer: () => ipcRenderer.invoke('stop-explorer'),
  startExplorer: () => ipcRenderer.invoke('start-explorer'),

  // App & Process Scanner
  getAllApps: () => ipcRenderer.invoke('get-all-apps'),
  getPopularApps: () => ipcRenderer.invoke('get-popular-apps'),
  getInstalledApps: (forceRefresh) => ipcRenderer.invoke('get-installed-apps', forceRefresh),
  getRunningApps: () => ipcRenderer.invoke('get-running-apps'),
  getRunningProcesses: () => ipcRenderer.invoke('get-running-processes'),
  resolveExePath: (nameOrExe) => ipcRenderer.invoke('resolve-exe-path', nameOrExe),
  
  // Status & Dialogs
  getStatus: () => ipcRenderer.invoke('get-status'),
  isAdmin: () => ipcRenderer.invoke('is-admin'),
  selectFile: () => ipcRenderer.invoke('select-file'),
  manualDetectAndBoost: () => ipcRenderer.invoke('manual-detect-and-boost'),
  forceApplyRule: (ruleId) => ipcRenderer.invoke('force-apply-rule', ruleId),

  // Local & GitHub Updater
  getInstallInfo: () => ipcRenderer.invoke('get-install-info'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  checkLocalUpdate: () => ipcRenderer.invoke('check-local-update'),
  applyLocalUpdate: (filePath) => ipcRenderer.invoke('apply-local-update', filePath),
  selectUpdateFile: () => ipcRenderer.invoke('select-update-file'),
  checkGithubUpdate: () => ipcRenderer.invoke('check-github-update'),
  downloadAndApplyGithubUpdate: (downloadUrl, fileName) => ipcRenderer.invoke('download-and-apply-github-update', downloadUrl, fileName),
  onGithubUpdateProgress: (callback) => {
    ipcRenderer.on('github-update-progress', (event, data) => callback(data));
  },

  // Hardware & Disk Cleaner
  getHardwareStats: () => ipcRenderer.invoke('get-hardware-stats'),
  boostComputer: () => ipcRenderer.invoke('boost-computer-now'),
  getDrivesInfo: () => ipcRenderer.invoke('get-drives-info'),
  getJunkSummary: () => ipcRenderer.invoke('get-junk-summary'),
  cleanJunkFiles: () => ipcRenderer.invoke('clean-junk-files'),
  scanLargeFiles: (drive, minSizeMb) => ipcRenderer.invoke('scan-large-files', drive, minSizeMb),
  deleteTargetFile: (filePath) => ipcRenderer.invoke('delete-target-file', filePath),
  showItemInFolder: (filePath) => ipcRenderer.invoke('show-item-in-folder', filePath),

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
  },
  onGamesScanned: (callback) => {
    ipcRenderer.on('games-scanned', (event, data) => callback(data));
  }
});
