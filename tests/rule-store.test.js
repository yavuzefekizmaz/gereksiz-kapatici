const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function loadStore(data) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../lib/rule-store.js'), 'utf8'), {
    module, exports: module.exports, process, console,
    require: name => name === 'electron' ? { app: { getPath: () => '/fake-user-data' } } : name === 'fs' ? {
      existsSync: () => data != null, readFileSync: () => JSON.stringify(data), writeFileSync: () => {}
    } : require(name)
  });
  return new module.exports();
}

test('upgrade enables exit and disables restore; only selected legacy protection conflicts are removed', () => {
  const store = loadStore({ settings: { autoRestoreOnExit: true },
    protectedApps: ['AnyDesk.exe', 'OneDrive.exe', 'code.exe', 'steam.exe'],
    rules: [{ closeTargets: ['ANYDESK'] }] });
  assert.equal(store.getSettings().exitAfterOptimization, true);
  assert.equal(store.getSettings().autoRestoreOnExit, false);
  assert.deepEqual(Array.from(store.getProtectedApps()), ['OneDrive.exe', 'code.exe', 'steam.exe']);
});

test('saving a OneDrive close selection resolves the old default protection conflict', () => {
  const store = loadStore({ settings: {}, protectedApps: ['OneDrive.exe', 'code.exe'], rules: [] });
  store.addRule({ closeTargets: ['onedrive.exe'] });
  assert.deepEqual(Array.from(store.getProtectedApps()), ['code.exe']);
});

test('auto-restore cannot stay enabled while automatic exit is on', () => {
  const store = loadStore(null);
  store.updateSettings({ autoRestoreOnExit: true });
  assert.equal(store.getSettings().autoRestoreOnExit, false);
  store.updateSettings({ exitAfterOptimization: false, autoRestoreOnExit: true });
  assert.equal(store.getSettings().autoRestoreOnExit, true);
});
