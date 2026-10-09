const { test } = require('node:test');
const assert = require('node:assert/strict');
const { refreshPickerData } = require('../src/app-picker-data');

test('running apps render while installed-app scan is still pending', async () => {
  let finishInstalled;
  const seen = {};
  const pending = refreshPickerData({
    getRunningApps: async () => [{ name: 'OneDrive.exe' }],
    getPopularApps: async () => [],
    getInstalledApps: () => new Promise(resolve => { finishInstalled = resolve; })
  }, { running: data => { seen.running = data; }, popular: () => {},
    installed: data => { seen.installed = data; }, error: (_kind, err) => { throw err; } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(seen.running[0].name, 'OneDrive.exe');
  assert.equal(seen.installed, undefined);
  finishInstalled([]);
  await pending;
});

test('installed-app failure does not prevent automatic running-list loading', async () => {
  const seen = {};
  await refreshPickerData({ getRunningApps: async () => [{ name: 'AnyDesk.exe' }],
    getPopularApps: async () => [], getInstalledApps: async () => { throw new Error('registry unavailable'); }
  }, { running: data => { seen.running = data; }, popular: () => {}, installed: () => {},
    error: kind => { seen.error = kind; } });
  assert.equal(seen.running[0].name, 'AnyDesk.exe');
  assert.equal(seen.error, 'installed');
});

test('every open requests a fresh running list without a refresh click', async () => {
  let calls = 0;
  const results = [];
  const api = { getRunningApps: async () => [{ name: `App${++calls}.exe` }] };
  const callbacks = { running: data => results.push(data[0].name), error: () => {} };
  await refreshPickerData(api, callbacks, { loadPopular: false, loadInstalled: false });
  await refreshPickerData(api, callbacks, { loadPopular: false, loadInstalled: false });
  assert.deepEqual(results, ['App1.exe', 'App2.exe']);
});
