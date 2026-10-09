const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { launchUpdateInstaller } = require('../lib/update-installer');

async function fixture(t) {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'voldena-update-'));
  t.after(() => fs.promises.rm(dir, { recursive: true, force: true }));
  const data = Buffer.from('MZ installer fixture');
  const downloadedFile = path.join(dir, 'setup.exe');
  await fs.promises.writeFile(downloadedFile, data);
  return { downloadedFile, files: [{ url: 'setup.exe', sha512: crypto.createHash('sha512').update(data).digest('base64') }] };
}

test('NSIS receives silent restart flags and the exact existing installation directory with spaces', async t => {
  const info = await fixture(t);
  const executable = path.join(os.tmpdir(), 'My Installed Apps', 'Voldena.exe');
  let unreferenced = false;
  await launchUpdateInstaller(info, executable, (exe, args, options) => {
    assert.equal(exe, info.downloadedFile);
    assert.deepEqual(args, ['--updated', '/S', '--force-run', `/D=${path.dirname(executable)}`]);
    assert.equal(options.detached, true);
    assert.equal(options.stdio, 'ignore');
    assert.equal(options.shell, undefined);
    const child = new EventEmitter(); child.unref = () => { unreferenced = true; };
    queueMicrotask(() => child.emit('spawn')); return child;
  });
  assert.equal(unreferenced, true);
});

test('missing, corrupt, or changed downloads never start an installer', async t => {
  const info = await fixture(t);
  const neverSpawn = () => { assert.fail('An invalid installer must not run'); };
  await assert.rejects(launchUpdateInstaller({ ...info, downloadedFile: 'relative.exe' }, process.execPath, neverSpawn));
  await assert.rejects(launchUpdateInstaller({ ...info, files: [] }, process.execPath, neverSpawn));
  await fs.promises.writeFile(info.downloadedFile, 'MZ changed download');
  await assert.rejects(launchUpdateInstaller(info, process.execPath, neverSpawn), /doğrulanamadı/);
  await fs.promises.writeFile(info.downloadedFile, 'invalid header');
  await assert.rejects(launchUpdateInstaller(info, process.execPath, neverSpawn), /Windows/);
  await fs.promises.unlink(info.downloadedFile);
  await assert.rejects(launchUpdateInstaller(info, process.execPath, neverSpawn), /ENOENT/);
});

test('asynchronous Windows installer launch failure is returned to the application', async t => {
  const info = await fixture(t);
  await assert.rejects(launchUpdateInstaller(info, process.execPath, () => {
    const child = new EventEmitter(); child.unref = () => assert.fail('Failed child must not be detached');
    queueMicrotask(() => child.emit('error', new Error('EACCES'))); return child;
  }), /EACCES/);
});
