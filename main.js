const { app, BrowserWindow, ipcMain, Tray, Menu, globalShortcut, Notification, nativeImage, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const RuleStore = require('./lib/rule-store');
const RamOptimizer = require('./lib/ram-optimizer');
const ProcessMonitor = require('./lib/process-monitor');
const AppScanner = require('./lib/app-scanner');
const GameDetector = require('./lib/game-detector');
const DiskCleaner = require('./lib/disk-cleaner');

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
    execSync('fltmc', { stdio: 'ignore', windowsHide: true, timeout: 3000 });
    return true;
  } catch (e) {
    try {
      execSync('net session', { stdio: 'ignore', windowsHide: true, timeout: 3000 });
      return true;
    } catch (e2) {
      return false;
    }
  }
}

function setupWindowsAutoStart(enable) {
  if (!app.isPackaged || process.env.PORTABLE_EXECUTABLE_FILE) throw new Error('Başlangıç kaydı için kurulu setup sürümünü kullanın.');
  // Remove the old elevated task before creating exactly one standard Run entry.
  const { execFileSync } = require('child_process');
  const script = "$ProgressPreference='SilentlyContinue'; try { $t=Get-ScheduledTask -TaskName 'VoldenaGameBooster' -ErrorAction SilentlyContinue; if($t){Unregister-ScheduledTask -TaskName 'VoldenaGameBooster' -Confirm:$false -ErrorAction Stop}; exit 0 } catch { exit 1 }";
  try { execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:8000}); }
  catch { throw new Error('Eski yükseltilmiş başlangıç görevi kaldırılamadı. Setup dosyasını bir kez yönetici olarak kurup tekrar deneyin.'); }
  app.setLoginItemSettings({ openAtLogin: enable, path: process.execPath, args: ['--startup'] });
  if (app.getLoginItemSettings({path:process.execPath,args:['--startup']}).openAtLogin !== enable) throw new Error('Windows başlangıç kaydı doğrulanamadı.');
}

// Single Instance Lock
app.disableHardwareAcceleration();
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    if (argv.includes('--startup') || argv.includes('--hidden')) return;
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });
}

// Request admin elevation if in dev mode


let mainWindow = null;
let tray = null;
let ruleStore = null;
let gameDetector = null;
let processMonitor = null;
let memoryInterval = null;
let updaterBridge = null;
const testMode = process.argv.includes('--voldena-safe-test');
if (testMode) {
  const arg = process.argv.find(a => a.startsWith('--test-data='));
  if (!arg || !path.isAbsolute(arg.slice(12))) throw new Error('Test data path required');
  app.setPath('userData', arg.slice(12));
}
function quitFully(report) {
  require('./lib/app-lifecycle').finishGameSession({app, monitor: processMonitor, tray,
    clearTimers: () => clearInterval(memoryInterval),
    saveReport: data => fs.writeFileSync(path.join(app.getPath('userData'),'last-optimization.json'),JSON.stringify(data,null,2))},report);
}
app.on('before-quit', () => { app.isQuitting = true; processMonitor?.stop(); });

const logoPath = path.join(__dirname, 'src', 'assets', 'voldena-mark.png');

function createWindow() {
  const appIcon = nativeImage.createFromPath(logoPath);
  const isHidden = process.argv.includes('--hidden') || process.argv.includes('--startup');

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
    show: !isHidden,
    focusable: !testMode,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: !testMode
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.webContents.on('did-finish-load', () => {
    if (processMonitor) {
      mainWindow.webContents.send('status-changed', processMonitor.getStatus());
    }
  });

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

  // Background auto-scan; safe tests never inspect personal game libraries.
  if (!testMode) gameDetector.scanAllGameLibraries().then(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('games-scanned', gameDetector.discoveredGames);
    }
  }).catch(e => console.error('Oyun kütüphaneleri tarama hatası:', e));

  processMonitor = new ProcessMonitor(ruleStore, gameDetector, state => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('status-changed',state);
    if (tray) updateTrayMenu();
  }, quitFully);

  const updateTrayMenu = createTray();

  if (!testMode) processMonitor.start();

  createWindow();

  // Register Emergency Hotkey to restore Explorer
  globalShortcut.register('CommandOrControl+Alt+R', () => {
    console.log('Acil durum hotkey tetiklendi: Explorer başlatılıyor...');
    RamOptimizer.startExplorer();
  });

  // Handle Live Hardware Statistics Broadcast (RAM + CPU every 1.5 seconds)
  let hardwareBusy = false;
  memoryInterval = setInterval(async () => {
    if (hardwareBusy) return;
    hardwareBusy = true;
    try {
    if (mainWindow && !mainWindow.isDestroyed() && (testMode || mainWindow.isVisible())) {
      const stats = await RamOptimizer.getSystemHardwareStats();
      mainWindow.webContents.send('memory-update', stats);
    }
    } finally { hardwareBusy = false; }
  }, 1500);

  // Once-only migration preserves an existing enabled startup preference after setup.
  if (!testMode && app.isPackaged && !process.env.PORTABLE_EXECUTABLE_FILE &&
      ruleStore.getSettings().autoStartOnBoot && ruleStore.getSettings().startupRegistrationVersion!==1) {
    try { setupWindowsAutoStart(true);ruleStore.updateSettings({startupRegistrationVersion:1}); }
    catch(err) { console.warn('Başlangıç kaydı taşınamadı:',err.message); }
  }
  if (testMode) {
    const resultPath = path.join(app.getPath('userData'),'smoke.json');
    const errors=[];
    mainWindow.webContents.on('console-message',(_event,level,message)=>{if(level>=3)errors.push(message);});
    mainWindow.webContents.on('did-finish-load',async () => {
      try {
        const readyDeadline=Date.now()+20000;
        while(Date.now()<readyDeadline) {
          if(await mainWindow.webContents.executeJavaScript("document.body.dataset.ready==='true'"))break;
          await new Promise(resolve=>setTimeout(resolve,500));
        }
        await new Promise(resolve=>setTimeout(resolve,1700));
        if (process.argv.includes('--preview-cleanup')) {
          await mainWindow.webContents.executeJavaScript('void window.openCleanupPreview()');
          await new Promise(resolve=>setTimeout(resolve,1500));
        }
        const ui = await mainWindow.webContents.executeJavaScript(`({cpu:!!document.getElementById('val-cpu-percent-text'),cpuText:document.getElementById('val-cpu-percent-text')?.textContent,ram:!!document.getElementById('val-ram-used'),disk:!!document.getElementById('tab-disk'),autoExit:!!document.getElementById('setting-auto-exit'),diskCount:document.querySelectorAll('#tab-disk').length,ready:document.body.dataset.ready,cleanupActive:document.getElementById('modal-cleanup').classList.contains('active'),cleanupOpacity:getComputedStyle(document.getElementById('modal-cleanup')).opacity})`);
        let startupTest=null;
        if (process.argv.includes('--verify-startup')) {
          setupWindowsAutoStart(true);
          const on=app.getLoginItemSettings({path:process.execPath,args:['--startup']}).openAtLogin;
          setupWindowsAutoStart(false);
          const off=app.getLoginItemSettings({path:process.execPath,args:['--startup']}).openAtLogin;
          startupTest={on,off};
        }
        fs.writeFileSync(path.join(app.getPath('userData'),'preview.png'),(await mainWindow.webContents.capturePage()).toPNG());
        fs.writeFileSync(resultPath,JSON.stringify({version:app.getVersion(),exe:process.execPath,hidden:!mainWindow.isVisible(),ui,errors,startupTest,hardware:await RamOptimizer.getSystemHardwareStats(),drives:await DiskCleaner.getDrivesInfo()}));
      } catch(e) { fs.writeFileSync(resultPath,JSON.stringify({error:e.message})); }
      setTimeout(()=>quitFully({test:true}),1000);
    });
  }

  // Rule Handlers
  ipcMain.handle('get-rules', () => ruleStore.getRules());
  ipcMain.handle('add-rule', (_, rule) => ruleStore.addRule(rule));
  ipcMain.handle('update-rule', (_, id, rule) => ruleStore.updateRule(id, rule));
  ipcMain.handle('delete-rule', (_, id) => ruleStore.deleteRule(id));

  // Settings Handlers
  ipcMain.handle('get-settings', () => ruleStore.getSettings());
  ipcMain.handle('update-settings', (_, newSettings) => {
    if ('autoStartOnBoot' in newSettings) setupWindowsAutoStart(!!newSettings.autoStartOnBoot);
    const updated = ruleStore.updateSettings(newSettings);
    processMonitor.settingsChanged();
    return updated;
  });

  // Manual Boost & Detection Handlers
  ipcMain.handle('manual-detect-and-boost', async () => {
    const check = await processMonitor.detectRunningGameNow();
    if (check.isRunning && check.rule) {
      const boostResult = await processMonitor.triggerRuleManually(check.rule);
      return {
        detected: true,
        rule: check.rule,
        closedCount: boostResult.closedCount
      };
    }
    return {
      detected: false,
      rules: ruleStore.getRules().filter(r => r.enabled)
    };
  });

  ipcMain.handle('force-apply-rule', async (_, ruleId) => {
    return await processMonitor.triggerRuleManually(ruleId, true);
  });

  updaterBridge = require('./lib/update-bridge')({ app, mainWindow, processMonitor, quit: () => quitFully({update:true}) });
  ipcMain.handle('get-app-version', () => app.getVersion());
  ipcMain.handle('get-install-info', () => updaterBridge.installInfo());
  ipcMain.handle('check-local-update', () => updaterBridge.checkLocal());
  ipcMain.handle('apply-local-update', (_, file) => updaterBridge.applyLocal(file));
  ipcMain.handle('select-update-file', () => updaterBridge.selectLocal(dialog));
  ipcMain.handle('check-github-update', () => updaterBridge.check());
  ipcMain.handle('download-and-apply-github-update', () => updaterBridge.downloadAndInstall());

  // Protected Apps Handlers
  ipcMain.handle('get-protected-apps', () => ruleStore.getProtectedApps());
  ipcMain.handle('update-protected-apps', (_, apps) => ruleStore.updateProtectedApps(apps));

  // Game Detector & Library Handlers
  ipcMain.handle('scan-game-libraries', () => testMode ? [] : gameDetector.scanAllGameLibraries());
  ipcMain.handle('get-discovered-games', () => testMode ? [] : gameDetector.getDiscoveredGames());
  ipcMain.handle('add-custom-game-path', (_, targetPath) => gameDetector.addCustomGamePath(targetPath));
  ipcMain.handle('remove-custom-game-path', (_, targetPath) => gameDetector.removeCustomGamePath(targetPath));
  ipcMain.handle('get-custom-game-paths', () => ruleStore.getCustomGamePaths());
  ipcMain.handle('save-verified-games', (_, games) => ruleStore.updateVerifiedGames(games));

  // Memory & Optimizer Handlers
  ipcMain.handle('get-memory-stats', () => RamOptimizer.getSystemHardwareStats());
  ipcMain.handle('get-detailed-processes', () => RamOptimizer.getDetailedProcesses());

  ipcMain.handle('optimize-ram', () => RamOptimizer.trimWorkingSets());

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
  ipcMain.handle('get-hardware-stats', () => RamOptimizer.getSystemHardwareStats());
  ipcMain.handle('boost-computer-now', () => RamOptimizer.boostComputerNow());

  // Disk & Storage Cleaner Endpoints
  ipcMain.handle('get-drives-info', () => DiskCleaner.getDrivesInfo());
  ipcMain.handle('get-junk-summary', () => DiskCleaner.getJunkSummary());
  ipcMain.handle('clean-junk-files', async (_, token) => {
    const selected = DiskCleaner.previews.get(token);
    if(!selected) return {success:false,error:'Önce temizlik önizlemesini açın.'};
    const bytes=selected.files.reduce((sum,f)=>sum+f.size,0);
    const answer = await dialog.showMessageBox(mainWindow,{type:'question',buttons:['Vazgeç','Gösterilen dosyaları temizle'],defaultId:0,cancelId:0,
      title:'Gösterilen geçici dosyaları sil', message: (bytes/1073741824).toFixed(3)+' GB — önizlemedeki '+selected.files.length+' dosya kalıcı olarak silinecek.',
      detail:'Yalnızca kullanıcı Temp (.tmp/.temp) ve CrashDumps (.dmp) klasörlerinde, en az 7 gündür değişmeyen doğrudan dosyalar. Değişen, bağlı ve kullanımda olan dosyalar atlanır.\nKişisel belgeler, OneDrive, Windows, shader önbellekleri ve geri dönüşüm kutusu kapsam dışıdır.'});
    if(answer.response !== 1) return {success:false,canceled:true,message:'Temizlik iptal edildi.'};
    const report=await DiskCleaner.cleanJunkFiles(token);
    try { fs.writeFileSync(path.join(app.getPath('userData'),'last-cleanup.json'),JSON.stringify({at:new Date().toISOString(),...report},null,2)); }
    catch { report.message+=' Rapor dosyası kaydedilemedi; sonuçlar bu ekranda gösteriliyor.'; }
    return report;
  });
  ipcMain.handle('scan-large-files', (_, driveLetter, minSizeMb) => DiskCleaner.scanLargeFiles(driveLetter, minSizeMb));
  ipcMain.handle('delete-target-file', async (_, filePath) => {
    if (!DiskCleaner.scannedFiles.has(filePath)) return {success:false,error:'Önce dosyayı tarayın.'};
    const answer = await dialog.showMessageBox(mainWindow,{type:'question',buttons:['Vazgeç','Geri dönüşüm kutusuna taşı'],defaultId:0,cancelId:0,message:filePath});
    if(answer.response!==1) return {success:false,error:'İptal edildi.'};
    return DiskCleaner.deleteTargetFile(filePath, shell);
  });
  ipcMain.handle('show-item-in-folder', (_, filePath) => {
    if (filePath && fs.existsSync(filePath)) {
      shell.showItemInFolder(filePath);
      return true;
    }
    return false;
  });

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
});
