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

test('machine scope remains explicit and /D stays last; watchdog launch is confirmed',async t=>{
  const info=await fixture(t);info.version='1.3.0';const calls=[];
  const exe=path.join(os.tmpdir(),'Installed App','Voldena.exe');
  await launchUpdateInstaller(info,exe,(file,args,options)=>{
    calls.push({file,args,options});const child=new EventEmitter();child.unref=()=>{};queueMicrotask(()=>{child.emit('spawn');child.emit('exit',0);});return child;
  },{allUsers:true,reportPath:path.join(os.tmpdir(),'update-result-test.json')});
  assert.equal(calls.length,2);assert.equal(calls[0].args.at(-1),`/D=${path.dirname(exe)}`);
  assert.ok(calls[0].args.includes('/allusers'));assert.equal(calls[1].file,'powershell.exe');
  assert.equal(calls[1].options.windowsHide,true);
  const launcher=Buffer.from(calls[1].args.at(-1),'base64').toString('utf16le');
  assert.match(launcher,/-WindowStyle Hidden/);
  const workerFile=launcher.match(/ReadAllText\('([^']+)'\)/)[1];
  t.after(()=>fs.rmSync(workerFile,{force:true}));
  const encodedWorker=fs.readFileSync(workerFile,'utf8');
  const script=Buffer.from(encodedWorker,'base64').toString('utf16le');
  assert.match(script,/installed-and-restarted/);assert.match(script,/installation-canceled-or-failed/);
  if(process.platform==='win32'){
    const parserFile=path.join(path.dirname(info.downloadedFile),'watchdog-test.ps1');
    fs.writeFileSync(parserFile,script);
    const parser=`$tokens=$null;$errors=$null;[System.Management.Automation.Language.Parser]::ParseFile('${parserFile.replace(/'/g,"''")}',[ref]$tokens,[ref]$errors)|Out-Null;if($errors.Count){$errors|% Message;exit 1}`;
    require('child_process').execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(parser,'utf16le').toString('base64')],{windowsHide:true,timeout:10000});
  }
});

test('update handoff waits for the independent worker launcher and rejects launcher failure',async t=>{
  const info=await fixture(t);info.version='1.5.1';let launcher;let completed=false;
  const reportPath=path.join(os.tmpdir(),'watchdog-handoff-test.json');
  const promise=launchUpdateInstaller(info,process.execPath,(file,args)=>{
    const child=new EventEmitter();child.unref=()=>{};
    if(file==='powershell.exe'){
      launcher=child;
      const script=Buffer.from(args.at(-1),'base64').toString('utf16le');
      const workerFile=script.match(/ReadAllText\('([^']+)'\)/)[1];
      t.after(()=>fs.rmSync(workerFile,{force:true}));
    }
    queueMicrotask(()=>child.emit('spawn'));return child;
  },{reportPath}).finally(()=>{completed=true;});
  while(!launcher)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(completed,false,'spawn must not allow the parent to quit');
  const rejected=assert.rejects(promise,/izleyicisi/);
  launcher.emit('exit',1);await rejected;
});
