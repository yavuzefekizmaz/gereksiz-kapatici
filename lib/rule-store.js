const fs = require('fs');
const path = require('path');
let app = null;
try {
  const electron = require('electron');
  app = electron.app;
} catch (e) {}

class RuleStore {
  constructor() {
    this.userDataPath = app ? app.getPath('userData') : process.cwd();
    this.filePath = path.join(this.userDataPath, 'voldena_config.json');
    this.data = this.loadData();
    this.migrateSelectedTrayApps();
  }

  getDefaultData() {
    return {
      settings: {
        autoStartOnBoot: false,
        startMinimized: true,
        activePreset: 'medium', // 'low', 'medium', 'high'
        autoGameDetection: true, // Auto detect any game running from Steam, Epic, etc.
        autoRestoreOnExit: false,
        exitAfterOptimization: true,
        forceCloseSelectedTrayApps: true,
        notifyOnAction: true,
        pollingIntervalMs: 2000,
        keepExplorer: true, // Default true: High mode keeps explorer.exe open
        smartSweep: false,   // If true, kills all non-protected user background processes
        defaultCloseTargets: [
          'chrome.exe',
          'msedge.exe',
          'discord.exe',
          'spotify.exe'
        ]
      },
      customGamePaths: [],
      verifiedGames: [],
      protectedApps: [
        'voldena.exe',
        'voldena oyun hizlandiricisi.exe',
        'steam.exe',
        'riotclientservices.exe',
        'epicgameslauncher.exe',
        'eadesktop.exe',
        'battle.net.exe',
        'code.exe'
      ],
      rules: []
    };
  }

  loadData() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const parsed = JSON.parse(raw);
        return {
          ...this.getDefaultData(),
          ...parsed,
          settings: { ...this.getDefaultData().settings, ...(parsed.settings || {}) }
        };
      }
    } catch (err) {
      console.error('Config yükleme hatası, varsayılanlar kullanılıyor:', err);
    }
    const defaults = this.getDefaultData();
    this.saveData(defaults);
    return defaults;
  }

  saveData(data = this.data) {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf8');
      this.data = data;
    } catch (err) {
      console.error('Config kaydetme hatası:', err);
    }
  }

  migrateSelectedTrayApps() {
    if (this.data.settings.trayClosingMigration === 1) return;
    const selected = new Set([
      ...(this.data.settings.defaultCloseTargets || []),
      ...(this.data.rules || []).flatMap(rule => rule.closeTargets || [])
    ].filter(value => typeof value === 'string').map(value => {
      const name = value.trim().toLowerCase();
      return name.endsWith('.exe') ? name : `${name}.exe`;
    }));
    // Remove only conflicting legacy defaults explicitly selected for closure.
    this.data.protectedApps = (this.data.protectedApps || []).filter(value => {
      if (typeof value !== 'string') return true;
      const name = value.trim().toLowerCase().replace(/\.exe$/i, '') + '.exe';
      return !(['anydesk.exe', 'onedrive.exe'].includes(name) && selected.has(name));
    });
    if (this.data.settings.exitAfterOptimization !== false) this.data.settings.autoRestoreOnExit = false;
    this.data.settings.trayClosingMigration = 1;
    this.saveData();
  }

  resolveClosingConflicts(rule) {
    const targets = new Set((rule.closeTargets || []).filter(value => typeof value === 'string')
      .map(value => value.trim().toLowerCase().replace(/\.exe$/i, '') + '.exe'));
    this.data.protectedApps = (this.data.protectedApps || []).filter(value => {
      if (typeof value !== 'string') return true;
      const name = value.trim().toLowerCase().replace(/\.exe$/i, '') + '.exe';
      return !(['anydesk.exe', 'onedrive.exe'].includes(name) && targets.has(name));
    });
  }

  getRules() {
    return this.data.rules || [];
  }

  addRule(rule) {
    if (!rule.id) rule.id = 'rule-' + Date.now();
    this.resolveClosingConflicts(rule);
    this.data.rules.push(rule);
    this.saveData();
    return rule;
  }

  updateRule(id, updatedRule) {
    const index = this.data.rules.findIndex(r => r.id === id);
    if (index !== -1) {
      this.data.rules[index] = { ...this.data.rules[index], ...updatedRule };
      this.resolveClosingConflicts(this.data.rules[index]);
      this.saveData();
      return this.data.rules[index];
    }
    return null;
  }

  deleteRule(id) {
    this.data.rules = this.data.rules.filter(r => r.id !== id);
    this.saveData();
  }

  getSettings() {
    return this.data.settings;
  }

  updateSettings(newSettings) {
    this.data.settings = { ...this.data.settings, ...newSettings };
    if (this.data.settings.exitAfterOptimization !== false) this.data.settings.autoRestoreOnExit = false;
    this.saveData();
    return this.data.settings;
  }

  getProtectedApps() {
    return this.data.protectedApps || [];
  }

  updateProtectedApps(apps) {
    this.data.protectedApps = apps;
    this.saveData();
  }

  getCustomGamePaths() {
    return this.data.customGamePaths || [];
  }

  updateCustomGamePaths(paths) {
    this.data.customGamePaths = paths;
    this.saveData();
  }

  getVerifiedGames() {
    return this.data.verifiedGames || [];
  }

  updateVerifiedGames(games) {
    this.data.verifiedGames = games;
    this.saveData();
  }
}

module.exports = RuleStore;
