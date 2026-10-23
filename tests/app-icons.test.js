const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');const {AppIcons}=require('../lib/app-icons');
test('native artwork is cached for known EXEs and never requested for system processes or untrusted file types',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'Voldena-icon-test-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));const file=path.join(directory,'spotify.exe');fs.writeFileSync(file,'MZ fixture');let calls=0;
  const icons=new AppIcons({getFileIcon:async()=>{calls++;return {isEmpty:()=>false,toDataURL:()=> 'data:image/png;base64,AA=='};}},{resolvedPathCache:new Map([['spotify.exe',file]])});
  const result=await icons.batch(['spotify.exe','svchost.exe',path.join(directory,'script.ps1')]);assert.ok(result['spotify.exe']);assert.equal(result['svchost.exe'],null);assert.equal(calls,1);await icons.get('spotify.exe');assert.equal(calls,1);
});
test('first icon batch loads installed and running locations once, including friendly aliases',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'Voldena-icon-inventory-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));const file=path.join(directory,'example.exe');fs.writeFileSync(file,'MZ fixture');let scans=0;
  const scanner={resolvedPathCache:new Map(),getInstalledApps:async()=>{scans++;return [{name:'Example App',exe:'example.exe',path:file}];},getRunningProcesses:async()=>{scans++;return [];}};
  const icons=new AppIcons({getFileIcon:async()=>({isEmpty:()=>false,toDataURL:()=> 'data:image/png;base64,AA=='})},scanner);
  const [first,second]=await Promise.all([icons.batch(['example.exe']),icons.batch(['Example App'])]);assert.ok(first['example.exe']);assert.ok(second['Example App']);assert.equal(scans,2);
  await icons.batch(['example.exe']);assert.equal(scans,2);
});
