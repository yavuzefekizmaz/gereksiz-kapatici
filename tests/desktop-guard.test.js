const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{EventEmitter}=require('node:events');
const DesktopGuard=require('../lib/desktop-guard');
test('desktop guard must acknowledge independent recovery before acquisition; restore is signaled separately',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'voldena-guard-'));
  try{
    let commands=0;
    const guard=new DesktopGuard(dir,{spawnProcess:(exe,args,options)=>{
      commands++;assert.equal(exe,'powershell.exe');assert.equal(options.windowsHide,true);assert.equal(options.detached,false);
      const child=new EventEmitter();child.unref=()=>{};queueMicrotask(()=>{const json=fs.readdirSync(dir).find(name=>name.endsWith('.json'));fs.writeFileSync(path.join(dir,json.replace(/\.json$/,'.ready')),'ready');child.emit('spawn');});return child;
    }});
    await guard.acquire(['cs2.exe']);assert.equal(guard.active,true);
    await guard.acquire(['othergame.exe']);assert.equal(commands,1);
    assert.deepEqual(JSON.parse(fs.readFileSync(guard.state.base+'.json')),['cs2','othergame']);
    guard.requestRestore();assert.equal(fs.existsSync(guard.state.base+'.restore'),true);
    fs.writeFileSync(guard.state.base+'.done','restored');assert.equal(guard.active,false);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('invalid game identity never spawns a desktop operation',async()=>{
  const guard=new DesktopGuard(os.tmpdir(),{spawnProcess(){assert.fail('Must not spawn');}});
  await assert.rejects(guard.acquire(['game.exe;bad']),/doğrulanamadı/);
});
test('Windows parses desktop watchdog without executing a desktop closure',()=>{
  if(process.platform!=='win32')return;
  const {execFileSync}=require('node:child_process');
  const file=path.join(__dirname,'../lib/desktop-guard.ps1').replace(/'/g,"''");
  const code=`$tokens=$null;$parseErrors=$null;[System.Management.Automation.Language.Parser]::ParseFile('${file}',[ref]$tokens,[ref]$parseErrors)|Out-Null;if($parseErrors.Count){$parseErrors|Out-String|Write-Output;exit 1}`;
  execFileSync('powershell.exe',['-NoProfile','-EncodedCommand',Buffer.from(code,'utf16le').toString('base64')],{windowsHide:true});
});
