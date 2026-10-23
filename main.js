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

const testMode = process.argv.includes('--voldena-safe-test');
if (testMode) {
  const arg = process.argv.find(a => a.startsWith('--test-data='));
  if (!arg || !path.isAbsolute(arg.slice(12))) throw new Error('Test data path required');
  app.setPath('userData', arg.slice(12));
}

// Single Instance Lock
// Keep a manual rendering fallback; normal scrolling uses GPU composition.
if (process.argv.includes('--software-rendering')) app.disableHardwareAcceleration();
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    if (argv.includes('--quick-boost')) {
      if (processMonitor) void runQuickBoost();
      else pendingQuickBoost = true;
      return;
    }
    if (argv.includes('--startup') || argv.includes('--hidden')) return;
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send('manual-open');
    }
  });
}

// Request admin elevation if in dev mode


function safeHandle(channel, handler) { ipcMain.handle(channel, (event, ...args) => { require('./lib/ipc-security').assertTrustedSender(event,mainWindow); return handler(event,...args); }); }
let mainWindow = null;
let tray = null;
let ruleStore = null;
let gameDetector = null;
let processMonitor = null;
let memoryInterval = null;
let updaterBridge = null;
let desktopGuard = null;
let resourceAdvisor = null;
let resourceAdvice = [];
let pendingQuickBoost = process.argv.includes('--quick-boost');
let quickBoostBusy = false;
async function runQuickBoost() {
  if (quickBoostBusy) return;
  quickBoostBusy = true;
  try {
    await require('./lib/quick-boost').quickBoost(processMonitor, {
      memory: () => RamOptimizer.getSystemMemoryStats(),
      save: result => fs.writeFileSync(path.join(app.getPath('userData'), 'last-quick-boost.json'), JSON.stringify(result, null, 2)),
      notify: body => { if (Notification.isSupported()) new Notification({ title: 'Voldena Hızlandır ve Kapat', body, icon: logoPath }).show(); },
      quit: quitFully
    });
  } finally { quickBoostBusy = false; }
}
function quitFully(report) {
  desktopGuard?.requestRestore();
  require('./lib/app-lifecycle').finishGameSession({app, monitor: processMonitor, tray,
    clearTimers: () => clearInterval(memoryInterval),
    saveReport: data => fs.writeFileSync(path.join(app.getPath('userData'),'last-optimization.json'),JSON.stringify(data,null,2))},report);
}
app.on('before-quit', () => { app.isQuitting = true; desktopGuard?.requestRestore(); processMonitor?.stop(); });

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
  mainWindow.webContents.setWindowOpenHandler(() => ({action:'deny'}));
  mainWindow.webContents.on('will-navigate', event => event.preventDefault());
  mainWindow.webContents.on('will-attach-webview', event => event.preventDefault());
  mainWindow.webContents.session.setPermissionRequestHandler((_webContents,_permission,callback)=>callback(false));

  mainWindow.webContents.on('did-finish-load', () => {
    if (processMonitor) {
      mainWindow.webContents.send('status-changed', processMonitor.getStatus());
    }
  });

  mainWindow.on('close', (event) => {
    const settings = ruleStore.getSettings();
    if (!app.isQuitting) {
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
  if (!gotTheLock) return;
  ruleStore = new RuleStore();
  gameDetector = new GameDetector(ruleStore);
  resourceAdvisor=new (require('./lib/resource-advisor'))({supported:name=>RamOptimizer.isCloseableProcess(name),isGame:(name,file)=>gameDetector.isProcessAGame(name,file).isGame});

  // Background auto-scan; safe tests never inspect personal game libraries.
  if (!testMode && !pendingQuickBoost) gameDetector.scanAllGameLibraries().then(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('games-scanned', gameDetector.discoveredGames);
    }
  }).catch(e => console.error('Oyun kütüphaneleri tarama hatası:', e));

  processMonitor = new ProcessMonitor(ruleStore, gameDetector, state => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('status-changed',state);
    if (tray) updateTrayMenu();
  }, quitFully);
  desktopGuard=new (require('./lib/desktop-guard'))(path.join(app.getPath('userData'),'desktop-recovery'));
  if(!testMode)processMonitor.desktopGuard=desktopGuard;
  if(!testMode)processMonitor.armExitRestore=async(rule,running)=>{
    const names=[...running].filter(name=>processMonitor.matchesTrigger(rule.triggerProcess,new Set([name])));
    const games=names.flatMap(name=>(running.identities?.get(name)||[]).map(identity=>{const [pid,startedAt]=identity.split(':');return {pid:Number(pid),startedAt};}));
    const targets=[];
    for(const target of rule.exitLaunchTargets||[]){
      const file=path.isAbsolute(target)?target:await AppScanner.resolveExecutablePath(target);
      if(!file||!path.isAbsolute(file)||!/\.exe$/i.test(file)||!fs.existsSync(file))throw Error('Geri açılacak uygulamanın EXE konumu bulunamadı: '+target);
      if(path.basename(file).toLowerCase()===rule.triggerProcess?.toLowerCase())throw Error('Oyun kendisinin geri açma hedefi olamaz.');
      targets.push({path:file,wallpaper:/^wallpaper(32|64)?\.exe$/i.test(path.basename(file))});
    }
    return require('./lib/exit-restore').armExitRestore({directory:path.join(app.getPath('userData'),'exit-restore'),games,targets});
  };
  processMonitor.onReport=report=>fs.writeFileSync(path.join(app.getPath('userData'),'last-session.json'),JSON.stringify(report,null,2));

  // Quick mode works with games already running and never opens the full interface.
  if (testMode) processMonitor.fetchRunningProcesses = async () => new Set();
  if (pendingQuickBoost) { void runQuickBoost(); return; }

  const updateTrayMenu = createTray();

  if (!testMode) processMonitor.start();

  createWindow();

  // Register Emergency Hotkey to restore Explorer
  globalShortcut.register('CommandOrControl+Alt+R', () => {
    desktopGuard?.requestRestore();
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
  }, 3000);

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
          // Hidden windows suspend CSS transitions; force the settled state for the screenshot.
          await mainWindow.webContents.executeJavaScript("const modal=document.getElementById('modal-cleanup');modal.style.transition='none';modal.style.opacity='1';modal.querySelector('.modal-box').style.transform='none';");
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
        const features=process.argv.includes('--verify-ui')?await require('./lib/ui-verification')(mainWindow.webContents,app.getPath('userData')):null;
        fs.writeFileSync(resultPath,JSON.stringify({version:app.getVersion(),exe:process.execPath,hidden:!mainWindow.isVisible(),ui,errors,startupTest,features,hardware:await RamOptimizer.getSystemHardwareStats(),drives:await DiskCleaner.getDrivesInfo()}));
      } catch(e) { fs.writeFileSync(resultPath,JSON.stringify({error:e.message})); }
      setTimeout(()=>quitFully({test:true}),1000);
    });
  }

  // Rule Handlers
  safeHandle('get-rules', () => ruleStore.getRules());
  safeHandle('add-rule', (_, rule) => ruleStore.addRule(rule));
  safeHandle('update-rule', (_, id, rule) => ruleStore.updateRule(id, rule));
  safeHandle('delete-rule', (_, id) => ruleStore.deleteRule(id));

  // Settings Handlers
  safeHandle('get-settings', () => ruleStore.getSettings());
  safeHandle('update-settings', (_, newSettings) => {
    if ('autoStartOnBoot' in newSettings && !testMode) setupWindowsAutoStart(!!newSettings.autoStartOnBoot);
    const updated = ruleStore.updateSettings(newSettings);
    processMonitor.settingsChanged();
    return updated;
  });

  // Manual Boost & Detection Handlers
  safeHandle('manual-detect-and-boost', async () => {
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

  safeHandle('force-apply-rule', async (_, ruleId) => {
    return await processMonitor.triggerRuleManually(ruleId, true);
  });

  updaterBridge = require('./lib/update-bridge')({ app, mainWindow, processMonitor, quit: () => quitFully({update:true}) });
  safeHandle('get-app-version', () => app.getVersion());
  safeHandle('get-install-info', () => updaterBridge.installInfo());
  safeHandle('check-local-update', () => updaterBridge.checkLocal());
  safeHandle('apply-local-update', (_, file) => updaterBridge.applyLocal(file));
  safeHandle('select-update-file', () => updaterBridge.selectLocal(dialog));
  safeHandle('check-github-update', () => updaterBridge.check());
  safeHandle('download-and-apply-github-update', () => updaterBridge.downloadAndInstall());

  // Protected Apps Handlers
  safeHandle('get-protected-apps', () => ruleStore.getProtectedApps());
  safeHandle('update-protected-apps', (_, apps) => ruleStore.updateProtectedApps(apps));

  // Game Detector & Library Handlers
  safeHandle('scan-game-libraries', () => testMode ? [] : gameDetector.scanAllGameLibraries());
  safeHandle('get-discovered-games', () => testMode ? [{name:'Test Oyunu',exe:'VoldenaFixtureGame.exe',path:'C:\\VoldenaFixture',platform:'Test',executables:['VoldenaFixtureGame.exe']}] : gameDetector.getDiscoveredGames());
  safeHandle('add-custom-game-path', (_, targetPath) => gameDetector.addCustomGamePath(targetPath));
  safeHandle('remove-custom-game-path', (_, targetPath) => gameDetector.removeCustomGamePath(targetPath));
  safeHandle('get-custom-game-paths', () => ruleStore.getCustomGamePaths());
  safeHandle('save-verified-games', (_, games) => ruleStore.updateVerifiedGames(games));

  // Memory & Optimizer Handlers
  safeHandle('get-memory-stats', () => RamOptimizer.getSystemHardwareStats());
  safeHandle('get-detailed-processes', () => RamOptimizer.getDetailedProcesses());

  safeHandle('optimize-ram', async () => {
    if(testMode)return {success:false,message:'Yalıtılmış test: gerçek uygulamalar kapatılmadı.'};
    if(processMonitor.isProcessing||processMonitor.installing)return {success:false,message:'Devam eden işlem tamamlanınca yeniden deneyin.'};
    const settings=ruleStore.getSettings();
    const protectedApps=[...ruleStore.getProtectedApps(),...ruleStore.getRules().map(rule=>rule.triggerProcess)];
    const protectedNames=new Set(protectedApps.map(name=>RamOptimizer.normalizeProcessName(name)));
    const targets=(settings.defaultCloseTargets||[]).filter(name=>RamOptimizer.isCloseableProcess(name)&&!protectedNames.has(RamOptimizer.normalizeProcessName(name)));
    const rows=await AppScanner.getRunningProcesses({throwOnError:true,currentSessionOnly:true});
    const active=targets.filter(name=>rows.some(row=>RamOptimizer.normalizeProcessName(row.name)===RamOptimizer.normalizeProcessName(name)));
    if(!active.length)return {success:false,message:'Seçili listede şu anda kapatılabilecek açık uygulama yok. Toplu kapatma listesinden uygulama seçebilirsiniz. Windows boş belleği kendisi yönetir; oyunların belleği zorla boşaltılmaz.'};
    const answer=await dialog.showMessageBox(mainWindow,{type:'question',buttons:['Vazgeç','Listelenen uygulamaları kapat'],defaultId:0,cancelId:0,message:active.join(', '),detail:'RAM yükünü azaltmak için yalnızca bu seçili uygulamalara normal kapatma isteği gönderilecek. Kaydedilmemiş çalışmaları önce kaydedin. Sistem genelinde zorla RAM boşaltılmaz.'});
    if(answer.response!==1)return {success:false,message:'İptal edildi; hiçbir uygulama kapatılmadı.'};
    const report=await processMonitor.triggerRuleManually({id:'memory-action',name:'Seçili uygulamalarla RAM yükünü azalt',closeTargets:active,launchTargets:[],optimizationLevel:'medium',keepExplorer:true});
    return {success:true,message:`${report.closedCount} uygulama kapandı; ${report.report.failed.length} işlem tamamlanamadı. Ayrıntılar Son İşlem Raporu bölümünde. Bellek değişimi diğer uygulamalardan da etkilenir; FPS artışı garanti edilmez.`};
  });

  safeHandle('stop-explorer', () => RamOptimizer.stopExplorer());
  safeHandle('start-explorer', () => {desktopGuard?.requestRestore();return RamOptimizer.startExplorer();});
  safeHandle('get-last-session', () => {
    try{return JSON.parse(fs.readFileSync(path.join(app.getPath('userData'),'last-session.json'),'utf8'));}catch{return null;}
  });
  safeHandle('get-startup-context',()=>({hiddenLaunch:process.argv.includes('--startup')||process.argv.includes('--hidden'),testMode,canConfigureStartup:testMode||(app.isPackaged&&!process.env.PORTABLE_EXECUTABLE_FILE)}));
  safeHandle('get-bulk-candidates',async()=>{
    if(testMode)return [{name:'chrome.exe',running:true,protected:false},{name:'discord.exe',running:false,protected:true}];
    const running=await AppScanner.getRunningProcesses({throwOnError:true,currentSessionOnly:true});
    const protectedSet=new Set([...ruleStore.getProtectedApps(),...ruleStore.getRules().map(rule=>rule.triggerProcess)].map(name=>RamOptimizer.normalizeProcessName(name)));
    return RamOptimizer.supportedCloseTargets().map(name=>({name,running:running.some(row=>row.name.toLowerCase()===name),protected:protectedSet.has(name)}));
  });
  safeHandle('get-resource-advice',async()=>{
    const settings=ruleStore.getSettings();if(testMode||settings.resourceWarnings===false)return [];
    const rows=await AppScanner.getRunningProcesses({throwOnError:true,currentSessionOnly:true,metrics:true});
    resourceAdvice=resourceAdvisor.sample(rows,{protectedApps:[...ruleStore.getProtectedApps(),...ruleStore.getRules().map(rule=>rule.triggerProcess)],selected:[...(settings.defaultCloseTargets||[]),...(processMonitor.activeRule?.closeTargets||[])],cpuThreshold:Math.min(100,Math.max(1,Number(settings.resourceCpuThreshold)||15)),ramThreshold:Math.min(100,Math.max(1,Number(settings.resourceRamThreshold)||10))});
    return resourceAdvice;
  });
  safeHandle('dismiss-resource-advice',(_,name)=>{if(typeof name==='string')resourceAdvisor.ignore(name);});
  safeHandle('close-resource-advice',async(_,name)=>{
    const candidate=resourceAdvice.find(item=>item.name===name);
    if(!candidate||testMode)return {success:false,message:'Öneri eskidi; yeniden kontrol edin.'};
    const answer=await dialog.showMessageBox(mainWindow,{type:'question',buttons:['Hayır, açık kalsın','Evet, kapat'],defaultId:0,cancelId:0,message:`${name}: CPU %${candidate.cpuPercent}, RAM %${candidate.ramPercent}`,detail:'Bu uygulama kapatma listenizde değil. Kapatmak istiyor musunuz? Kaydedilmemiş çalışmaları önce kaydedin.'});
    if(answer.response!==1)return {success:false,message:'Uygulama açık bırakıldı.'};
    const protectedApps=[...ruleStore.getProtectedApps(),...ruleStore.getRules().map(rule=>rule.triggerProcess)];
    const report=await RamOptimizer.killProcesses([name],protectedApps,{allowedPaths:candidate.paths,forceTrayApps:ruleStore.getSettings().forceCloseSelectedTrayApps!==false});
    resourceAdvisor.ignore(name);
    return {success:report.closedApps.length>0,message:report.closedApps.length?'Uygulama kapatıldı.':'Kapatılamadı veya uygulama artık çalışmıyor.'};
  });
  safeHandle('get-running-processes', async () => {
    const set = await processMonitor.fetchRunningProcesses();
    return Array.from(set).sort();
  });

  // App Scanner & Catalog Endpoints
  safeHandle('get-all-apps', () => AppScanner.getAllAppsDataset());
  safeHandle('get-popular-apps', () => AppScanner.getPopularApps());
  safeHandle('get-installed-apps', (_, forceRefresh) => AppScanner.getInstalledApps(forceRefresh));
  safeHandle('get-running-apps', () => AppScanner.getRunningProcesses());
  safeHandle('resolve-exe-path', (_, nameOrExe) => AppScanner.resolveExecutablePath(nameOrExe));
  
  // File & Folder Dialogs
  safeHandle('select-file', async () => {
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

  safeHandle('select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Oyun veya Kütüphane Klasörü Seç (SteamLibrary, Games vb.)',
      properties: ['openDirectory']
    });
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  });

  safeHandle('is-admin', () => isRunningAsAdmin());
  safeHandle('get-status', () => processMonitor.getStatus());
  safeHandle('get-hardware-stats', () => RamOptimizer.getSystemHardwareStats());
  safeHandle('boost-computer-now', () => RamOptimizer.boostComputerNow());

  // Disk & Storage Cleaner Endpoints
  safeHandle('get-drives-info', () => DiskCleaner.getDrivesInfo());
  safeHandle('get-junk-summary', () => DiskCleaner.getJunkSummary());
  safeHandle('clean-junk-files', async (_, token) => {
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
  safeHandle('scan-large-files', (_, driveLetter, minSizeMb) => DiskCleaner.scanLargeFiles(driveLetter, minSizeMb));
  safeHandle('delete-target-file', async (_, filePath) => {
    if (!DiskCleaner.scannedFiles.has(filePath)) return {success:false,error:'Önce dosyayı tarayın.'};
    const answer = await dialog.showMessageBox(mainWindow,{type:'question',buttons:['Vazgeç','Geri dönüşüm kutusuna taşı'],defaultId:0,cancelId:0,message:filePath});
    if(answer.response!==1) return {success:false,error:'İptal edildi.'};
    return DiskCleaner.deleteTargetFile(filePath, shell);
  });
  safeHandle('show-item-in-folder', (_, filePath) => {
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
