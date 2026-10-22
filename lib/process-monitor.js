const RamOptimizer = require('./ram-optimizer');
const AppScanner = require('./app-scanner');

class ProcessMonitor {
  constructor(ruleStore, gameDetector = null, onStateChange = null, onComplete = null, clock = {}) {
    Object.assign(this, { ruleStore, gameDetector, onStateChange, onComplete });
    this.now = clock.now || Date.now;
    this.setTimeout = clock.setTimeout || setTimeout;
    this.clearTimeout = clock.clearTimeout || clearTimeout;
    this.sessions = new Map();
    this.baseline = null;
    this.lastRunningProcesses = new Set();
    this.activeRuleId = null;
    this.activeRule = null;
    this.closedAppsHistory = [];
    this.explorerStopped = false;
    this.isProcessing = false;
    this.exitTimer = null;
    this.exitDeadline = null;
    this.installing = false;
    this.generation = 0;
  }
  setGameDetector(detector) { this.gameDetector = detector; }
  start() {
    if (this.intervalId) return;
    this.baseline = null;
    this.intervalId = setInterval(() => this.tick(), this.ruleStore.getSettings().pollingIntervalMs || 2000);
    return this.tick();
  }
  stop() {
    this.generation++;
    clearInterval(this.intervalId);
    this.intervalId = null;
    this.cancelExit();
  }
  cancelExit() {
    if (this.exitTimer) this.clearTimeout(this.exitTimer);
    this.exitTimer = null; this.exitDeadline = null;
  }
  settingsChanged() {
    if (this.ruleStore.getSettings().exitAfterOptimization === false) {
      this.cancelExit();
      for (const session of this.sessions.values()) session.exitEligible = false;
    }
  }
  setInstalling(value) { this.installing = value; if (value) this.cancelExit(); }
  async fetchRunningProcesses() {
    const rows = await AppScanner.getRunningProcesses({ throwOnError: true, currentSessionOnly: true });
    const names = new Set(rows.map(p => p.name.toLowerCase()));
    names.identities = new Map();
    for (const row of rows) {
      const name = row.name.toLowerCase();
      if (!names.identities.has(name)) names.identities.set(name, []);
      names.identities.get(name).push(`${row.pid}:${row.startedAt || ''}`);
    }
    return names;
  }
  identities(running) {
    return new Set([...running].flatMap(name => (running.identities?.get(name) || [name]).map(id => `${name}:${id}`)));
  }
  matchesTrigger(trigger, running) {
    if (typeof trigger !== 'string' || !running) return false;
    const name = trigger.trim().toLowerCase().replace(/\.exe$/i, '') + '.exe';
    if (running.has(name) || running.has(name.slice(0, -4))) return true;
    const aliases = { 'valorant.exe': 'valorant-win64-shipping.exe', 'csgo.exe': 'cs2.exe' };
    return !!aliases[name] && running.has(aliases[name]);
  }
  matchingIdentities(rule, running) {
    return [...this.identities(running)].filter(identity => this.matchesTrigger(rule.triggerProcess, new Set([identity.split(':')[0]])));
  }
  rulesFor(running) {
    const settings = this.ruleStore.getSettings();
    const rules = this.ruleStore.getRules().filter(r => r.enabled && this.matchesTrigger(r.triggerProcess, running));
    if (settings.autoGameDetection !== false && this.gameDetector) for (const name of running) {
      if (rules.some(r => this.matchesTrigger(r.triggerProcess, new Set([name])))) continue;
      const check = this.gameDetector.isProcessAGame(name, AppScanner.resolvedPathCache.get(name) || '');
      if (check.isGame) rules.push({ id: `auto-${name}`, name: check.gameName || name,
        triggerProcess: name, enabled: true, isAutoDetected: true,
        closeTargets: settings.defaultCloseTargets || [], launchTargets: [] });
    }
    return rules;
  }
  async detectRunningGameNow() {
    const running = await this.fetchRunningProcesses();
    if (!running) throw new Error('Süreç listesi alınamadı');
    const rule = this.rulesFor(running)[0];
    return { isRunning: !!rule, rule: rule || null };
  }
  async triggerRuleManually(ruleOrId) {
    if (this.isProcessing || this.installing) throw new Error('Başka bir işlem sürüyor; tamamlanmasını bekleyin.');
    const settings = this.ruleStore.getSettings();
    const rule = typeof ruleOrId === 'string' ? this.ruleStore.getRules().find(r => r.id === ruleOrId) : ruleOrId;
    this.isProcessing = true;
    this.cancelExit();
    for (const session of this.sessions.values()) session.exitEligible=false;
    try {
      const report = await this.handleRuleTrigger(rule || { id: 'manual', name: 'Seçili uygulamalar',
        closeTargets: settings.defaultCloseTargets || [], launchTargets: [] }, settings, this.ruleStore.getProtectedApps());
      this.emit();
      return { success: true, rule, closedCount: report.closedApps.length, report };
    } finally { this.isProcessing = false; }
  }
  async tick() {
    if (this.isProcessing || this.installing) return;
    this.isProcessing = true;
    const generation = this.generation;
    try {
      const running = await this.fetchRunningProcesses();
      if (!running) return;
      this.lastRunningProcesses = running;
      const identities = this.identities(running);
      // Every already-running process is a baseline, including games discovered later.
      if (this.baseline === null) { this.baseline = identities; return; }
      this.baseline = new Set([...this.baseline].filter(id => identities.has(id)));
      const settings = this.ruleStore.getSettings();
      this.settingsChanged();
      for (const [id, session] of this.sessions) {
        if (!session.identities.some(key => identities.has(key))) {
          this.sessions.delete(id);
          if (settings.autoRestoreOnExit === true && settings.exitAfterOptimization === false)
            await RamOptimizer.relaunchProcesses(session.report?.closedApps || []);
        } else {
          session.identities=this.matchingIdentities(session.rule,running).filter(key=>!this.baseline.has(key));
        }
      }
      if (![...this.sessions.values()].some(s => s.exitEligible)) this.cancelExit();
      const rules = this.rulesFor(running);
      const protectedApps = [...this.ruleStore.getProtectedApps(), ...rules.map(r => r.triggerProcess)];
      for (const rule of rules) {
        if (this.sessions.has(rule.id)) continue;
        const matches = this.matchingIdentities(rule, running);
        if (!matches.some(id => !this.baseline.has(id))) continue;
        if ([...this.sessions.values()].some(s=>s.identities.some(id=>matches.includes(id)))) continue;
        const session = { rule, identities: matches.filter(id=>!this.baseline.has(id)), exitEligible: false };
        this.sessions.set(rule.id, session);
        this.cancelExit();
        session.report = await this.handleRuleTrigger(rule, settings, protectedApps);
        if (generation !== this.generation) return;
        session.completedAt = this.now();
        session.exitEligible = this.ruleStore.getSettings().exitAfterOptimization !== false;
      }
      if (generation !== this.generation) return;
      this.activeRule = [...this.sessions.values()].at(-1)?.rule || null;
      this.activeRuleId = this.activeRule?.id || null;
      this.scheduleExit(); this.emit();
    } catch (err) {
      console.warn('Oyun izleme hatası:', err.message);
      this.cancelExit();
    } finally { this.isProcessing = false; }
  }
  scheduleExit() {
    if (this.exitTimer || this.installing || this.ruleStore.getSettings().exitAfterOptimization === false) return;
    const eligible = [...this.sessions.values()].filter(s => s.exitEligible);
    if (!eligible.length) return;
    this.exitDeadline = Math.max(...eligible.map(s => s.completedAt)) + 60000;
    this.exitTimer = this.setTimeout(async () => {
      this.exitTimer = null;
      if (this.installing || this.isProcessing || this.ruleStore.getSettings().exitAfterOptimization === false) {
        this.exitDeadline = null; return;
      }
      const generation = this.generation;
      try {
        const running = await this.fetchRunningProcesses();
        if (!running) return;
        const ids = this.identities(running);
        if (generation !== this.generation || this.installing || this.ruleStore.getSettings().exitAfterOptimization === false) return;
        const live = [...this.sessions.values()].filter(s => s.exitEligible && s.identities.some(id => ids.has(id)));
        if (live.length) this.onComplete?.({ sessions: live.map(s => ({ ruleId: s.rule.id, ...s.report })) });
      } catch (err) { console.warn('Çıkış öncesi oyun doğrulanamadı:', err.message); }
      finally { this.exitDeadline = null; }
    }, Math.max(0, this.exitDeadline - this.now()));
  }
  async handleRuleTrigger(rule, settings, protectedApps) {
    this.activeRule = rule; this.activeRuleId = rule.id;
    const report = { killed: [], failed: [], closedApps: [], skipped: [], details: [], launches: [] };
    const closeTargets = Array.isArray(rule.closeTargets) ? rule.closeTargets : settings.defaultCloseTargets || [];
    if (closeTargets.length && (rule.optimizationLevel || settings.activePreset) !== 'low') Object.assign(report, await RamOptimizer.killProcesses(closeTargets,
      [...protectedApps, rule.triggerProcess].filter(Boolean), { forceTrayApps: settings.forceCloseSelectedTrayApps !== false }));
    for (const target of rule.launchTargets || []) report.launches.push({ target, launched: await RamOptimizer.launchTarget(target) });
    this.closedAppsHistory = report.closedApps; this.lastReport = report;
    return report;
  }
  async handleRuleExit(settings) {
    this.cancelExit();
    if (settings.autoRestoreOnExit === true && settings.exitAfterOptimization === false) await RamOptimizer.relaunchProcesses(this.closedAppsHistory);
    this.activeRuleId = null; this.activeRule = null; this.closedAppsHistory = [];
  }
  emit() {
    const state=this.getStatus(),signature=JSON.stringify(state);
    if(signature!==this.lastStateSignature){this.lastStateSignature=signature;this.onStateChange?.(state);}
  }
  getStatus() {
    return { status: this.activeRule ? 'active' : 'idle', activeRuleId: this.activeRuleId,
      activeRule: this.activeRule, closedApps: this.closedAppsHistory.map(a => a.name),
      explorerStopped: false, isMonitoring: !!this.intervalId, exitDeadline: this.exitDeadline, report: this.lastReport };
  }
}
module.exports = ProcessMonitor;
