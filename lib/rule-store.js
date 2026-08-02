const fs = require('fs');
const path = require('path');
const { app } = require('electron');

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
        autoRestoreOnExit: true,
        notifyOnAction: true,
        pollingIntervalMs: 2000,
        keepExplorer: false, // If true, High mode won't kill explorer.exe
        smartSweep: false    // If true, High mode kills all non-protected user background processes
      },
      protectedApps: [
        'voldena.exe',
        'code.exe',
        'anydesk.exe',
        'onedrive.exe'
      ],
      rules: [
        {
          id: 'rule-valorant',
          name: 'Valorant Modu',
          enabled: true,
          triggerProcess: 'VALORANT-Win64-Shipping.exe',
          alias: 'Valorant',
          closeTargets: [
            'chrome.exe',
            'msedge.exe',
            'discord.exe',
            'spotify.exe',
            'epicgameslauncher.exe',
            'steam.exe'
          ],
          launchTargets: [],
          optimizationLevel: 'medium',
          keepExplorer: false,
          smartSweep: false
        },
        {
          id: 'rule-cs2',
          name: 'CS2 / CS:GO Modu',
          enabled: true,
          triggerProcess: 'cs2.exe',
          alias: 'Counter-Strike 2',
          closeTargets: [
            'chrome.exe',
            'msedge.exe',
            'discord.exe',
            'spotify.exe',
            'epicgameslauncher.exe'
          ],
          launchTargets: [],
          optimizationLevel: 'medium',
          keepExplorer: false,
          smartSweep: false
        },
        {
          id: 'rule-vscode',
          name: 'VS Code Çalışma Modu',
          enabled: true,
          triggerProcess: 'code.exe',
          alias: 'VS Code',
          closeTargets: [],
          launchTargets: [],
          optimizationLevel: 'low',
          keepExplorer: true,
          smartSweep: false
        }
      ]
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
    return this.data.protectedApps;
  }

  updateProtectedApps(apps) {
    this.data.protectedApps = apps;
    this.saveData();
  }
}

module.exports = RuleStore;
