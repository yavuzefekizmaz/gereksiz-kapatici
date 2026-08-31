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
  }

  getDefaultData() {
    return {
      settings: {
        autoStartOnBoot: false,
        startMinimized: true,
        activePreset: 'medium', // 'low', 'medium', 'high'
        autoGameDetection: true, // Auto detect any game running from Steam, Epic, etc.
        autoRestoreOnExit: true,
        notifyOnAction: true,
        pollingIntervalMs: 2000,
        keepExplorer: true, // Default true: High mode keeps explorer.exe open
        smartSweep: false,   // If true, kills all non-protected user background processes
        defaultCloseTargets: [
          'chrome.exe',
          'msedge.exe',
          'discord.exe',
          'spotify.exe',
          'epicgameslauncher.exe',
          'steam.exe'
        ]
      },
      customGamePaths: [],
      verifiedGames: [],
      protectedApps: [
        'voldena.exe',
        'code.exe',
        'anydesk.exe',
        'onedrive.exe'
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

  getRules() {
    return this.data.rules || [];
  }

  addRule(rule) {
    if (!rule.id) rule.id = 'rule-' + Date.now();
    this.data.rules.push(rule);
    this.saveData();
    return rule;
  }

  updateRule(id, updatedRule) {
    const index = this.data.rules.findIndex(r => r.id === id);
    if (index !== -1) {
      this.data.rules[index] = { ...this.data.rules[index], ...updatedRule };
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
