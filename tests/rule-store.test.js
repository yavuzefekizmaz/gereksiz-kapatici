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
      existsSync: () => data != null, readFileSync: () => JSON.stringify(data), writeFileSync: () => {}, renameSync: () => {}
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

test('new close selections never silently remove explicit user protection', () => {
  const store = loadStore({ settings: {}, protectedApps: ['OneDrive.exe', 'code.exe'], rules: [] });
  store.addRule({ closeTargets: ['onedrive.exe'] });
  assert.deepEqual(Array.from(store.getProtectedApps()), ['OneDrive.exe', 'code.exe']);
});

test('auto-restore cannot stay enabled while automatic exit is on', () => {
  const store = loadStore(null);
  store.updateSettings({ autoRestoreOnExit: true });
  assert.equal(store.getSettings().autoRestoreOnExit, true);
  assert.equal(store.getSettings().exitAfterOptimization, false);
  store.updateSettings({exitAfterOptimization:true});
  assert.equal(store.getSettings().autoRestoreOnExit,false);
  store.updateSettings({ exitAfterOptimization: false, autoRestoreOnExit: true });
  assert.equal(store.getSettings().autoRestoreOnExit, true);
});
test('Explorer opt-out keeps the app monitoring; minimize behavior cannot be disabled',()=>{
  const store=loadStore(null);store.updateSettings({keepExplorer:false,startMinimized:false});
  assert.equal(store.getSettings().exitAfterOptimization,false);assert.equal(store.getSettings().startMinimized,true);
});

test('unknown fields and newer schemas are preserved and never overwritten',()=>{
  const original={schemaVersion:9,customFutureValue:{keep:true},settings:{exitAfterOptimization:false},rules:[{id:'keep'}]};
  const store=loadStore(original);
  assert.equal(store.data.customFutureValue.keep,true);
  assert.equal(store.getRules()[0].id,'keep');
  assert.throws(()=>store.updateSettings({startMinimized:false}),/Daha yeni/);
});
