const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const UpdateManager = require('../lib/update-manager');

function fixture({ supported = true, canInstall = true } = {}) {
  const app = { getVersion: () => '1.2.1', isQuitting: false };
  const updater = new EventEmitter();
  const calls = { check: 0, download: 0, install: 0 };
  updater.checkForUpdates = async () => { calls.check++; updater.emit('update-available', { version: '1.2.2' }); };
  updater.downloadUpdate = async () => { calls.download++; updater.emit('update-downloaded', { version: '1.2.2' }); };
  updater.quitAndInstall = (silent, restart) => { assert.equal(silent, false); assert.equal(restart, true); calls.install++; };
  const manager = new UpdateManager({ app, updater, supported, beforeInstall: () => canInstall });
  return { app, updater, calls, manager };
}

test('setup update is checked, explicitly downloaded, then installed', async () => {
  const { manager, updater, calls, app } = fixture();
  assert.equal(updater.autoDownload, false);
  assert.equal(updater.autoInstallOnAppQuit, false);
  await manager.check();
  assert.equal(manager.state.status, 'available');
  assert.equal(calls.download, 0);
  manager.install();
  assert.equal(calls.install, 0);
  await manager.download();
  assert.equal(manager.state.status, 'downloaded');
  manager.install();
  assert.equal(calls.install, 1);
  assert.equal(app.isQuitting, true);
});

test('portable/development mode never invoke the NSIS updater', async () => {
  const { manager, calls } = fixture({ supported: false });
  await manager.check();
  await manager.download();
  manager.install();
  assert.equal(manager.state.status, 'unsupported');
  assert.deepEqual(calls, { check: 0, download: 0, install: 0 });
});

test('an active game prevents installation without discarding the download', async () => {
  const { manager, calls, app } = fixture({ canInstall: false });
  await manager.check();
  await manager.download();
  manager.install();
  assert.equal(manager.state.status, 'downloaded');
  assert.equal(calls.install, 0);
  assert.equal(app.isQuitting, false);
});

test('network failures release the check lock and allow retry', async () => {
  const { manager, updater } = fixture();
  updater.checkForUpdates = async () => { throw new Error('offline'); };
  await manager.check();
  assert.equal(manager.state.status, 'error');
  assert.equal(manager.checking, false);
  updater.checkForUpdates = async () => updater.emit('update-not-available');
  await manager.check();
  assert.equal(manager.state.status, 'current');
});

test('duplicate checks/downloads do not create concurrent requests', async () => {
  const { manager, updater } = fixture();
  let release;
  let checks = 0;
  updater.checkForUpdates = () => { checks++; return new Promise(resolve => { release = resolve; }); };
  const pending = manager.check();
  await manager.check();
  assert.equal(checks, 1);
  release();
  await pending;
  manager.setState({ status: 'available' });
  let downloads = 0;
  updater.downloadUpdate = () => { downloads++; return new Promise(resolve => { release = resolve; }); };
  const download = manager.download();
  await manager.download();
  assert.equal(downloads, 1);
  release();
  await download;
});
