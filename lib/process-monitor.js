const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const RamOptimizer = require('./ram-optimizer');

class ProcessMonitor {
  constructor(ruleStore, onStateChangeCallback = null) {
    this.ruleStore = ruleStore;
    this.onStateChange = onStateChangeCallback;
    this.intervalId = null;
    this.activeRuleId = null;
    this.activeRule = null;
    this.closedAppsHistory = [];
    this.closedAppExePaths = [];
    this.explorerStopped = false;
    this.lastRunningProcesses = new Set();
    this.isProcessing = false;
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
      const { stdout } = await execAsync('tasklist /FO CSV /NH', { maxBuffer: 1024 * 1024 });
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
        if (!runningProcesses.has(activeTrigger)) {
          await this.handleRuleExit(settings);
        }
      }

      // Check if any rule should trigger
      if (!this.activeRuleId) {
        for (const rule of rules) {
          const trigger = rule.triggerProcess.toLowerCase();
          if (runningProcesses.has(trigger)) {
            await this.handleRuleTrigger(rule, settings, protectedApps);
            break;
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
    console.log(`[Voldena Engine] Ultra Tetiklendi: ${rule.name} (${rule.triggerProcess})`);
    this.activeRuleId = rule.id;
    this.activeRule = rule;

    const level = rule.optimizationLevel || settings.activePreset || 'medium';
    const shouldKeepExplorer = rule.keepExplorer !== undefined ? rule.keepExplorer : settings.keepExplorer;
    const shouldSmartSweep = rule.smartSweep !== undefined ? rule.smartSweep : settings.smartSweep;

    this.closedAppsHistory = [];
    this.closedAppExePaths = [];

    // 1. Set High CPU Priority for active game process
    await RamOptimizer.setProcessHighPriority(rule.triggerProcess);

    // 2. Launch secondary companion apps or domain triggers if configured
    if (rule.launchTargets && rule.launchTargets.length > 0) {
      for (const target of rule.launchTargets) {
        if (target && target.trim()) {
          try {
            exec(`start "" "${target.trim()}"`);
            console.log(`[Voldena Engine] Yan uygulama / Alan başlatıldı: ${target}`);
          } catch (e) {
            console.error(`Yan uygulama başlatılamadı (${target}):`, e.message);
          }
        }
      }
    }

    // 3. Close specified applications
    if (level === 'medium' || level === 'high') {
      if (rule.closeTargets && rule.closeTargets.length > 0) {
        const result = await RamOptimizer.killProcesses(rule.closeTargets, protectedApps);
        this.closedAppsHistory.push(...result.killed);
        if (result.killedPaths) this.closedAppExePaths.push(...result.killedPaths);
      }
    }

    // 4. Smart Sweep (Close all non-whitelisted user background processes like MSI Center)
    if (shouldSmartSweep) {
      console.log('[Voldena Engine] Smart-Sweep devrede: Tüm korumasız arka plan süreçleri kapatılıyor...');
      const sweepResult = await RamOptimizer.smartSweepProcesses(protectedApps, rule.triggerProcess);
      this.closedAppsHistory.push(...sweepResult.killed);
      if (sweepResult.killedPaths) this.closedAppExePaths.push(...sweepResult.killedPaths);
    }

    // Deduplicate lists
    this.closedAppsHistory = [...new Set(this.closedAppsHistory)];
    this.closedAppExePaths = [...new Set(this.closedAppExePaths)];

    // 5. Explorer Stop (Only if keepExplorer is FALSE)
    if (level === 'high') {
      await RamOptimizer.pauseNonEssentialServices();

      if (!shouldKeepExplorer) {
        console.log('[Voldena Engine] High Mod: Explorer kapatılıyor...');
        const stopped = await RamOptimizer.stopExplorer();
        this.explorerStopped = stopped;
      } else {
        console.log('[Voldena Engine] High Mod: Kullanıcı "Explorer\'ı Kapatma" seçeneğini açtığı için Explorer açık bırakıldı.');
        this.explorerStopped = false;
      }
    }

    // 6. Aggressive RAM Flush
    await RamOptimizer.trimWorkingSets();

    if (this.onStateChange) {
      this.onStateChange({
        status: 'active',
        activeRule: this.activeRule,
        closedApps: this.closedAppsHistory,
        explorerStopped: this.explorerStopped,
        level,
        keepExplorer: shouldKeepExplorer
      });
    }
  }

  async handleRuleExit(settings) {
    console.log(`[Voldena Engine] Oyun kapandı: ${this.activeRule ? this.activeRule.name : ''}`);
    
    // Restore non-essential Windows services
    await RamOptimizer.restoreNonEssentialServices();

    // Auto-restore Explorer if stopped
    if (this.explorerStopped) {
      console.log('[Voldena Engine] Explorer yeniden başlatılıyor...');
      await RamOptimizer.startExplorer();
      this.explorerStopped = false;
    }

    // Auto-reopen closed apps if autoRestoreOnExit setting is enabled
    if (settings.autoRestoreOnExit !== false && this.closedAppExePaths && this.closedAppExePaths.length > 0) {
      console.log('[Voldena Engine] Kapatılan uygulamalar otomatik yeniden açılıyor...');
      await RamOptimizer.relaunchProcesses(this.closedAppExePaths);
    }

    // Post-game RAM trim
    await RamOptimizer.trimWorkingSets();

    const previousRule = this.activeRule;
    this.activeRuleId = null;
    this.activeRule = null;
    this.closedAppsHistory = [];
    this.closedAppExePaths = [];

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
      closedApps: this.closedAppsHistory,
      explorerStopped: this.explorerStopped,
      isMonitoring: !!this.intervalId
    };
  }
}

module.exports = ProcessMonitor;
