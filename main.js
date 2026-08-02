const { app, BrowserWindow, ipcMain, Tray, Menu, globalShortcut, Notification, nativeImage } = require('electron');
const path = require('path');
const RuleStore = require('./lib/rule-store');
const RamOptimizer = require('./lib/ram-optimizer');
const ProcessMonitor = require('./lib/process-monitor');

let mainWindow = null;
let tray = null;
let ruleStore = null;
let processMonitor = null;
let memoryInterval = null;

const logoPath = path.join(__dirname, 'src', 'assets', 'logo.png');

function createWindow() {
  const appIcon = nativeImage.createFromPath(logoPath);

  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 940,
    minHeight: 660,
    title: 'Voldena Oyun Hızlandırıcısı',
    icon: appIcon,
    frame: false,
    transparent: false,
    backgroundColor: '#0a0d14',
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
          body: 'Sistem tepsisinde (System Tray) çalışmaya devam ediyor.',
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
          await RamOptimizer.trimWorkingSets();
          if (mainWindow) {
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

  processMonitor = new ProcessMonitor(ruleStore, (state) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('status-changed', state);
    }
    if (updateTrayMenu) updateTrayMenu();

    const settings = ruleStore.getSettings();
    if (Notification.isSupported() && settings.notifyOnAction) {
      if (state.status === 'active') {
        new Notification({
          title: `Voldena - ${state.activeRule.alias || state.activeRule.name} Başladı`,
          body: `Ultra Optimizasyon uygulandı. Oyun kapanınca kapatılan uygulamalar otomatik yeniden açılacaktır.`,
          icon: logoPath
        }).show();
      } else if (state.status === 'idle' && state.previousRule) {
        new Notification({
          title: 'Voldena - Oyun Kapandı',
          body: `${state.previousRule.alias || state.previousRule.name} kapandı. Arka plan uygulamaları otomatik geri açıldı.`,
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

  // IPC Handlers
  ipcMain.handle('get-rules', () => ruleStore.getRules());
  ipcMain.handle('add-rule', (_, rule) => ruleStore.addRule(rule));
  ipcMain.handle('update-rule', (_, id, rule) => ruleStore.updateRule(id, rule));
  ipcMain.handle('delete-rule', (_, id) => ruleStore.deleteRule(id));

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

  ipcMain.handle('get-protected-apps', () => ruleStore.getProtectedApps());
  ipcMain.handle('update-protected-apps', (_, apps) => ruleStore.updateProtectedApps(apps));

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
  
  ipcMain.handle('select-file', async () => {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Uygulama veya Kısayol Seç',
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

  ipcMain.handle('get-status', () => processMonitor.getStatus());

  // Window Controls IPC
  ipcMain.on('window-minimize', () => mainWindow.minimize());
  ipcMain.on('window-maximize', () => {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });
  ipcMain.on('window-close', () => mainWindow.close());
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (memoryInterval) clearInterval(memoryInterval);
  if (processMonitor) processMonitor.stop();
  RamOptimizer.startExplorer();
});
