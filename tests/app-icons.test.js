const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');const {AppIcons}=require('../lib/app-icons');
test('native artwork is cached for known EXEs and never requested for system processes or untrusted file types',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'Voldena-icon-test-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));const file=path.join(directory,'spotify.exe');fs.writeFileSync(file,'MZ fixture');let calls=0;
  const icons=new AppIcons({getFileIcon:async()=>{calls++;return {isEmpty:()=>false,toDataURL:()=> 'data:image/png;base64,AA=='};}},{resolvedPathCache:new Map([['spotify.exe',file]])});
  const result=await icons.batch(['spotify.exe','svchost.exe',path.join(directory,'script.ps1')]);assert.ok(result['spotify.exe']);assert.equal(result['svchost.exe'],null);assert.equal(calls,1);await icons.get('spotify.exe');assert.equal(calls,1);
});
