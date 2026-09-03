const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const RamOptimizer = require('./ram-optimizer');
const AppScanner = require('./app-scanner');

class ProcessMonitor {
  constructor(ruleStore, gameDetector = null, onStateChangeCallback = null) {
    this.ruleStore = ruleStore;
    this.gameDetector = gameDetector;
    this.onStateChange = onStateChangeCallback;
    this.intervalId = null;
    this.activeRuleId = null;
    this.activeRule = null;
    this.closedAppsHistory = []; // Array of { name, path }
    this.explorerStopped = false;
    this.lastRunningProcesses = new Set();
    this.isProcessing = false;
  }

  setGameDetector(detector) {
    this.gameDetector = detector;
  }

  start() {
    if (this.intervalId) return;
    const settings = this.ruleStore.getSettings();
    const interval = settings.pollingIntervalMs || 2000;

    this.intervalId = setInterval(() => {
      this.tick();
    }, interval);

    this.tick();
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async fetchRunningProcesses() {
    try {
      const { stdout } = await execAsync('tasklist /FO CSV /NH', { maxBuffer: 2 * 1024 * 1024 });
      const processes = new Set();
      const lines = stdout.split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        const match = line.match(/^"([^"]+)"/);
        if (match && match[1]) {
          processes.add(match[1].toLowerCase());
        }
      }
      return processes;
    } catch (err) {
      console.error('Süreç listesi alınamadı:', err.message);
      return new Set();
    }
  }

  async tick() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const runningProcesses = await this.fetchRunningProcesses();
      this.lastRunningProcesses = runningProcesses;

      const rules = this.ruleStore.getRules().filter(r => r.enabled);
      const settings = this.ruleStore.getSettings();
      const protectedApps = this.ruleStore.getProtectedApps();

      // Check if current active rule is still running
      if (this.activeRuleId) {
        const activeTrigger = this.activeRule.triggerProcess.toLowerCase();
        const activeTriggerWithExe = activeTrigger.endsWith('.exe') ? activeTrigger : `${activeTrigger}.exe`;
        const activeTriggerWithoutExe = activeTrigger.replace(/\.exe$/i, '');

        const isStillRunning = runningProcesses.has(activeTrigger) ||
                               runningProcesses.has(activeTriggerWithExe) ||
                               runningProcesses.has(activeTriggerWithoutExe);

        if (!isStillRunning) {
          await this.handleRuleExit(settings);
        }
      }

      // Check if any rule should trigger
      if (!this.activeRuleId) {
        let triggered = false;

        // 1. First priority: Check custom defined user rules
        for (const rule of rules) {
          if (!rule.triggerProcess) continue;
          const trigger = rule.triggerProcess.toLowerCase();
          const triggerWithExe = trigger.endsWith('.exe') ? trigger : `${trigger}.exe`;
          const triggerWithoutExe = trigger.replace(/\.exe$/i, '');

          if (runningProcesses.has(trigger) || runningProcesses.has(triggerWithExe) || runningProcesses.has(triggerWithoutExe)) {
            await this.handleRuleTrigger(rule, settings, protectedApps);
            triggered = true;
            break;
          }
        }

        // 2. Second priority: If no custom rule matched and autoGameDetection is enabled, check GameDetector
        if (!triggered && settings.autoGameDetection !== false && this.gameDetector) {
          for (const proc of runningProcesses) {
            const resolvedPath = AppScanner.resolvedPathCache.get(proc.toLowerCase()) || '';
            // Check if process matches known game
            const gameCheck = this.gameDetector.isProcessAGame(proc, resolvedPath);
            if (gameCheck.isGame) {
              const safeDefaults = ['chrome.exe', 'msedge.exe', 'discord.exe', 'spotify.exe'];
              const configuredDefaults = settings.defaultCloseTargets || safeDefaults;
              const safeCloseList = configuredDefaults.filter(t => !RamOptimizer.isLauncherProcess(t));

              const autoRule = {
                id: `auto-${proc}`,
                name: gameCheck.gameName || proc,
                alias: `${gameCheck.gameName || proc} (${gameCheck.platform || 'Otomatik Oyun'})`,
                triggerProcess: proc,
                enabled: true,
                optimizationLevel: settings.activePreset || 'medium',
                keepExplorer: settings.keepExplorer !== false,
                smartSweep: false, // CRITICAL: NEVER run aggressive smart sweep for auto-detected games!
                closeTargets: safeCloseList,
                launchTargets: [],
                isAutoDetected: true,
                platform: gameCheck.platform
              };

              console.log(`[Voldena Engine] Otomatik Oyun Algılandı: ${autoRule.name} (${proc}) [Platform: ${gameCheck.platform}]`);
              await this.handleRuleTrigger(autoRule, settings, protectedApps);
              break;
            }
          }
        }
      }
    } catch (err) {
      console.error('Monitor tick hatası:', err);
    } finally {
      this.isProcessing = false;
    }
  }

  async handleRuleTrigger(rule, settings, protectedApps) {
    console.log(`[Voldena Engine] ${rule.isAutoDetected ? 'Otomatik Oyun Algılandı' : 'Özel Kural Tetiklendi'}: ${rule.name} (${rule.triggerProcess})`);
    this.activeRuleId = rule.id;
    this.activeRule = rule;

    const level = rule.optimizationLevel || settings.activePreset || 'medium';
    const shouldKeepExplorer = rule.keepExplorer !== undefined ? rule.keepExplorer : (settings.keepExplorer !== false);
    // Smart Sweep is strictly prohibited for auto-detected rules
    const shouldSmartSweep = !rule.isAutoDetected && (rule.smartSweep !== undefined ? rule.smartSweep : !!settings.smartSweep);

    this.closedAppsHistory = [];

    // 1. Set High CPU Priority for active game process
    await RamOptimizer.setProcessHighPriority(rule.triggerProcess);

    // 2. Launch secondary companion apps or domain triggers if configured
    if (rule.launchTargets && rule.launchTargets.length > 0) {
      for (const target of rule.launchTargets) {
        if (target && target.trim()) {
          try {
            await RamOptimizer.launchTarget(target.trim());
          } catch (e) {
            console.error(`Açılış hedefi başlatılamadı (${target}):`, e.message);
          }
        }
      }
    }

    // 3. Close specified applications
    if (level === 'medium' || level === 'high') {
      const safeDefaults = ['chrome.exe', 'msedge.exe', 'discord.exe', 'spotify.exe'];
      let closeList = (rule.closeTargets && rule.closeTargets.length > 0) 
        ? rule.closeTargets 
        : (settings.defaultCloseTargets || safeDefaults);

      // Strictly protect launchers from being closed
      closeList = closeList.filter(t => !RamOptimizer.isLauncherProcess(t));

      if (closeList.length > 0) {
        const result = await RamOptimizer.killProcesses(closeList, protectedApps);
        if (result.closedApps && result.closedApps.length > 0) {
          this.closedAppsHistory.push(...result.closedApps);
        }
      }
    }

    // 4. Smart Sweep (Only if explicitly configured on custom user rule, NEVER on auto-detected rules)
    if (shouldSmartSweep) {
      console.log('[Voldena Engine] Smart-Sweep devrede: Güvenli arka plan temizliği...');
      const sweepResult = await RamOptimizer.smartSweepProcesses(protectedApps, rule.triggerProcess);
      if (sweepResult.closedApps && sweepResult.closedApps.length > 0) {
        this.closedAppsHistory.push(...sweepResult.closedApps);
      }
    }

    // Deduplicate closedAppsHistory by name
    const seenNames = new Set();
    this.closedAppsHistory = this.closedAppsHistory.filter(item => {
      if (!item || !item.name) return false;
      const key = item.name.toLowerCase();
      if (seenNames.has(key)) return false;
      seenNames.add(key);
      return true;
    });

    // 5. Explorer Stop (Only if keepExplorer is FALSE in High Mode)
    if (level === 'high') {
      await RamOptimizer.pauseNonEssentialServices();

      if (!shouldKeepExplorer) {
        console.log('[Voldena Engine] High Mod: Explorer kapatılıyor...');
        const stopped = await RamOptimizer.stopExplorer();
        this.explorerStopped = stopped;
      } else {
        console.log('[Voldena Engine] High Mod: Explorer açık bırakıldı.');
        this.explorerStopped = false;
      }
    }

    // 6. Aggressive RAM Flush
    await RamOptimizer.trimWorkingSets();

    if (this.onStateChange) {
      this.onStateChange({
        status: 'active',
        activeRule: this.activeRule,
        closedApps: this.closedAppsHistory.map(a => a.name),
        explorerStopped: this.explorerStopped,
        level,
        keepExplorer: shouldKeepExplorer,
        isAutoDetected: !!rule.isAutoDetected
      });
    }
  }

  async handleRuleExit(settings) {
    console.log(`[Voldena Engine] Oyun / Tetikleyici kapandı: ${this.activeRule ? this.activeRule.name : ''}`);
    
    // Restore non-essential Windows services
    await RamOptimizer.restoreNonEssentialServices();

    // Auto-restore Explorer if stopped
    if (this.explorerStopped) {
      console.log('[Voldena Engine] Explorer yeniden başlatılıyor...');
      await RamOptimizer.startExplorer();
      this.explorerStopped = false;
    }

    // Auto-reopen closed apps if autoRestoreOnExit setting is enabled
    if (settings.autoRestoreOnExit !== false && this.closedAppsHistory && this.closedAppsHistory.length > 0) {
      console.log(`[Voldena Engine] Kapatılan ${this.closedAppsHistory.length} uygulama otomatik yeniden açılıyor...`);
      await RamOptimizer.relaunchProcesses(this.closedAppsHistory);
    }

    // Post-game RAM trim
    await RamOptimizer.trimWorkingSets();

    const previousRule = this.activeRule;
    this.activeRuleId = null;
    this.activeRule = null;
    this.closedAppsHistory = [];

    if (this.onStateChange) {
      this.onStateChange({
        status: 'idle',
        previousRule,
        level: settings.activePreset
      });
    }
  }

  getStatus() {
    return {
      activeRuleId: this.activeRuleId,
      activeRule: this.activeRule,
      closedApps: this.closedAppsHistory.map(a => a.name),
      explorerStopped: this.explorerStopped,
      isMonitoring: !!this.intervalId
    };
  }
}

module.exports = ProcessMonitor;
