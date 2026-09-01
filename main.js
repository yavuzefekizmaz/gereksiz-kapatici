const { app, BrowserWindow, ipcMain, Tray, Menu, globalShortcut, Notification, nativeImage, dialog } = require('electron');
const path = require('path');
const { execSync } = require('child_process');
const RuleStore = require('./lib/rule-store');
const RamOptimizer = require('./lib/ram-optimizer');
const ProcessMonitor = require('./lib/process-monitor');
const AppScanner = require('./lib/app-scanner');
const GameDetector = require('./lib/game-detector');

// Global error handlers to prevent silent crashes
process.on('uncaughtException', (err) => {
  console.error('[Voldena Engine] Beklenmeyen hata (uncaughtException):', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Voldena Engine] İşlenmeyen promise hatası (unhandledRejection):', reason);
});

function isRunningAsAdmin() {
  if (process.platform !== 'win32') return true;
  try {
    execSync('fltmc', { stdio: 'ignore' });
    return true;
  } catch (e) {
    try {
      execSync('net session', { stdio: 'ignore' });
      return true;
    } catch (e2) {
      return false;
    }
  }
}

function ensureAdminPrivileges() {
  if (process.platform !== 'win32') return;

  if (isRunningAsAdmin()) {
    console.log('[Voldena Engine] Uygulama Yönetici (Administrator) yetkileriyle aktif.');
    return;
  }

  // If in packaged app (.exe), manifest requireAdministrator handles elevation on launch
  if (app.isPackaged) {
    return;
  }

  if (process.argv.includes('--elevated-attempted')) {
    console.warn('[Voldena Engine] Yönetici izni kullanıcı tarafından reddedildi, standart modda devam ediliyor.');
    return;
  }

  console.log('[Voldena Engine] Geliştirme modunda Yönetici (UAC) izni isteniyor...');
  try {
    const exe = process.execPath;
    const cwd = process.cwd();
    const args = ['.', ...process.argv.slice(2), '--elevated-attempted'];
    const argStr = args.map(a => `\`"${a}\`"`).join(' ');
    const psCmd = `Start-Process -FilePath "${exe}" -ArgumentList '${argStr}' -WorkingDirectory "${cwd}" -Verb RunAs`;
    execSync(`powershell -NoProfile -WindowStyle Hidden -Command "${psCmd}"`);

    app.quit();
    process.exit(0);
  } catch (err) {
    console.warn('[Voldena Engine] UAC yükseltme isteği iptal edildi:', err.message);
  }
}

// Single Instance Lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });
}

// Request admin elevation if in dev mode
ensureAdminPrivileges();

let mainWindow = null;
let tray = null;
let ruleStore = null;
let gameDetector = null;
let processMonitor = null;
let memoryInterval = null;

const logoPath = path.join(__dirname, 'src', 'assets', 'logo.png');

function createWindow() {
  const appIcon = nativeImage.createFromPath(logoPath);

  mainWindow = new BrowserWindow({
    width: 1180,
    height: 790,
    minWidth: 990,
    minHeight: 680,
    title: 'Voldena Oyun Hızlandırıcısı',
    icon: appIcon,
    frame: false,
    transparent: false,
    backgroundColor: '#0a0e17',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.on('close', (event) => {
    const settings = ruleStore.getSettings();
    if (settings.startMinimized && !app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      if (Notification.isSupported() && settings.notifyOnAction) {
        new Notification({
          title: 'Voldena Oyun Hızlandırıcısı',
          body: 'Sistem tepsisinde (System Tray) izlemeye devam ediyor.',
          icon: logoPath
        }).show();
      }
    }
  });
}

function createTray() {
  const trayIcon = nativeImage.createFromPath(logoPath).resize({ width: 18, height: 18 });

  tray = new Tray(trayIcon);
  tray.setToolTip('Voldena Oyun Hızlandırıcısı (Aktif)');

  const updateContextMenu = () => {
    const status = processMonitor ? processMonitor.getStatus() : { activeRule: null };
    const contextMenu = Menu.buildFromTemplate([
      {
        label: status.activeRule ? `Oyun Aktif: ${status.activeRule.alias || status.activeRule.name}` : 'Durum: İzleniyor (Boşta)',
        enabled: false
      },
      { type: 'separator' },
      {
        label: 'Arayüzü Göster / Gizle',
        click: () => {
          if (mainWindow.isVisible()) {
            mainWindow.hide();
          } else {
            mainWindow.show();
            mainWindow.focus();
          }
        }
      },
      {
        label: 'Hızlı RAM Temizle',
        click: async () => {
          const res = await RamOptimizer.trimWorkingSets();
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('memory-update', RamOptimizer.getSystemMemoryStats());
          }
        }
      },
      {
        label: 'Acil Explorer Başlat (Ctrl+Alt+R)',
        click: () => RamOptimizer.startExplorer()
      },
      { type: 'separator' },
      {
        label: 'Çıkış Yap',
        click: () => {
          app.isQuitting = true;
          RamOptimizer.startExplorer();
          app.quit();
        }
      }
    ]);
    tray.setContextMenu(contextMenu);
  };

  updateContextMenu();

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  return updateContextMenu;
}

app.whenReady().then(() => {
  ruleStore = new RuleStore();
  gameDetector = new GameDetector(ruleStore);

  // Background auto-scan for game libraries on startup
  gameDetector.scanAllGameLibraries().then(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('games-scanned', gameDetector.discoveredGames);
    }
  }).catch(e => console.error('Oyun kütüphaneleri tarama hatası:', e));

  processMonitor = new ProcessMonitor(ruleStore, gameDetector, (state) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('status-changed', state);
    }
    if (updateTrayMenu) updateTrayMenu();

    const settings = ruleStore.getSettings();
    if (Notification.isSupported() && settings.notifyOnAction) {
      if (state.status === 'active') {
        new Notification({
          title: `Voldena - ${state.activeRule.alias || state.activeRule.name} Başladı`,
          body: `Ultra Optimizasyon uygulandı. Oyun kapanınca kapatılan uygulamalar otomatik geri açılacaktır.`,
          icon: logoPath
        }).show();
      } else if (state.status === 'idle' && state.previousRule) {
        new Notification({
          title: 'Voldena - Oyun Kapandı',
          body: `${state.previousRule.alias || state.previousRule.name} kapandı. Kapatılan uygulamalar geri açıldı.`,
          icon: logoPath
        }).show();
      }
    }
  });

  const updateTrayMenu = createTray();

  processMonitor.start();

  createWindow();

  // Register Emergency Hotkey to restore Explorer
  globalShortcut.register('CommandOrControl+Alt+R', () => {
    console.log('Acil durum hotkey tetiklendi: Explorer başlatılıyor...');
    RamOptimizer.startExplorer();
  });

  // Handle Memory Statistics Broadcast (Live every 1.5 seconds)
  memoryInterval = setInterval(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const stats = RamOptimizer.getSystemMemoryStats();
      mainWindow.webContents.send('memory-update', stats);
    }
  }, 1500);

  // Apply Windows startup settings
  const settings = ruleStore.getSettings();
  try {
    app.setLoginItemSettings({
      openAtLogin: !!settings.autoStartOnBoot,
      path: app.getPath('exe'),
      args: ['--hidden']
    });
  } catch (e) {}

  // Rule Handlers
  ipcMain.handle('get-rules', () => ruleStore.getRules());
  ipcMain.handle('add-rule', (_, rule) => ruleStore.addRule(rule));
  ipcMain.handle('update-rule', (_, id, rule) => ruleStore.updateRule(id, rule));
  ipcMain.handle('delete-rule', (_, id) => ruleStore.deleteRule(id));

  // Settings Handlers
  ipcMain.handle('get-settings', () => ruleStore.getSettings());
  ipcMain.handle('update-settings', (_, newSettings) => {
    const updated = ruleStore.updateSettings(newSettings);
    if ('autoStartOnBoot' in newSettings) {
      try {
        app.setLoginItemSettings({
          openAtLogin: !!newSettings.autoStartOnBoot,
          path: app.getPath('exe'),
          args: ['--hidden']
        });
      } catch (e) {}
    }
    return updated;
  });

  // Protected Apps Handlers
  ipcMain.handle('get-protected-apps', () => ruleStore.getProtectedApps());
  ipcMain.handle('update-protected-apps', (_, apps) => ruleStore.updateProtectedApps(apps));

  // Game Detector & Library Handlers
  ipcMain.handle('scan-game-libraries', () => gameDetector.scanAllGameLibraries());
  ipcMain.handle('get-discovered-games', () => gameDetector.getDiscoveredGames());
  ipcMain.handle('add-custom-game-path', (_, targetPath) => gameDetector.addCustomGamePath(targetPath));
  ipcMain.handle('remove-custom-game-path', (_, targetPath) => gameDetector.removeCustomGamePath(targetPath));
  ipcMain.handle('get-custom-game-paths', () => ruleStore.getCustomGamePaths());
  ipcMain.handle('save-verified-games', (_, games) => ruleStore.updateVerifiedGames(games));

  // Memory & Optimizer Handlers
  ipcMain.handle('get-memory-stats', () => RamOptimizer.getSystemMemoryStats());
  ipcMain.handle('get-detailed-processes', () => RamOptimizer.getDetailedProcesses());

  ipcMain.handle('optimize-ram', async (_, level) => {
    if (level === 'low') {
      return await RamOptimizer.trimWorkingSets();
    } else if (level === 'medium') {
      const rules = ruleStore.getRules();
      let closeList = [];
      rules.forEach(r => { if (r.closeTargets) closeList.push(...r.closeTargets); });
      closeList = [...new Set(closeList)];
      await RamOptimizer.killProcesses(closeList, ruleStore.getProtectedApps());
      return await RamOptimizer.trimWorkingSets();
    } else if (level === 'high') {
      const rules = ruleStore.getRules();
      let closeList = [];
      rules.forEach(r => { if (r.closeTargets) closeList.push(...r.closeTargets); });
      closeList = [...new Set(closeList)];
      await RamOptimizer.killProcesses(closeList, ruleStore.getProtectedApps());
      
      const setts = ruleStore.getSettings();
      if (!setts.keepExplorer) {
        await RamOptimizer.stopExplorer();
      }
      return await RamOptimizer.trimWorkingSets();
    }
  });

  ipcMain.handle('stop-explorer', () => RamOptimizer.stopExplorer());
  ipcMain.handle('start-explorer', () => RamOptimizer.startExplorer());
  ipcMain.handle('get-running-processes', async () => {
    const set = await processMonitor.fetchRunningProcesses();
    return Array.from(set).sort();
  });

  // App Scanner & Catalog Endpoints
  ipcMain.handle('get-all-apps', () => AppScanner.getAllAppsDataset());
  ipcMain.handle('get-popular-apps', () => AppScanner.getPopularApps());
  ipcMain.handle('get-installed-apps', (_, forceRefresh) => AppScanner.getInstalledApps(forceRefresh));
  ipcMain.handle('get-running-apps', () => AppScanner.getRunningProcesses());
  ipcMain.handle('resolve-exe-path', (_, nameOrExe) => AppScanner.resolveExecutablePath(nameOrExe));
  
  // File & Folder Dialogs
  ipcMain.handle('select-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Uygulama, Oyun veya Kısayol Seç',
      properties: ['openFile'],
      filters: [
        { name: 'Çalıştırılabilir Dosyalar ve Kısayollar', extensions: ['exe', 'bat', 'cmd', 'lnk', 'url'] },
        { name: 'Tüm Dosyalar', extensions: ['*'] }
      ]
    });
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  });

  ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Oyun veya Kütüphane Klasörü Seç (SteamLibrary, Games vb.)',
      properties: ['openDirectory']
    });
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  });

  ipcMain.handle('is-admin', () => isRunningAsAdmin());
  ipcMain.handle('get-status', () => processMonitor.getStatus());

  // Window Controls IPC
  ipcMain.on('window-minimize', () => mainWindow.minimize());
  ipcMain.on('window-maximize', () => {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });
  ipcMain.on('window-close', () => mainWindow.close());
});

app.on('window-all-closed', (event) => {
  const settings = ruleStore ? ruleStore.getSettings() : { startMinimized: true };
  if (settings.startMinimized && !app.isQuitting) {
    if (event && event.preventDefault) event.preventDefault();
  } else {
    app.quit();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (memoryInterval) clearInterval(memoryInterval);
  if (processMonitor) processMonitor.stop();
  RamOptimizer.startExplorer();
});
