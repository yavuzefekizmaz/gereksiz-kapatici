const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('fs'),os=require('os'),path=require('path');const Cleaner=require('../lib/disk-cleaner');
test('cleanup deletes only previewed old regular files; changed/new/personal files survive',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'voldena-clean-test-'));
  const oldLocal=process.env.LOCALAPPDATA;process.env.LOCALAPPDATA=root;
  fs.mkdirSync(path.join(root,'Temp'));fs.mkdirSync(path.join(root,'CrashDumps'));fs.mkdirSync(path.join(root,'Temp','nested'));
  const put=(relative,old=false)=>{const file=path.join(root,relative);fs.writeFileSync(file,'abcd');if(old){const time=new Date(Date.now()-10*86400000);fs.utimesSync(file,time,time);}return file;};
  const old=put('Temp/old.tmp',true),changed=put('CrashDumps/changed.dmp',true),newFile=put('Temp/new.tmp'),personal=put('document.txt',true),nested=put('Temp/nested/keep.txt',true);
  try {
    const preview=await Cleaner.getJunkSummary();assert.equal(preview.totalMb,8/1048576);
    fs.appendFileSync(changed,'changed');const later=put('Temp/later.tmp',true);
    const result=await Cleaner.cleanJunkFiles(preview.token);assert.equal(result.deletedCount,1);assert.equal(result.skippedCount,1);
    assert.equal(fs.existsSync(old),false);for(const file of [changed,newFile,personal,nested,later])assert.equal(fs.existsSync(file),true);
    await assert.rejects(Cleaner.cleanJunkFiles(preview.token),/yeniden/);
  } finally {if(oldLocal===undefined)delete process.env.LOCALAPPDATA;else process.env.LOCALAPPDATA=oldLocal;
    // Test-owned sandbox only; never a user cleanup root.
    assert.ok(root.startsWith(os.tmpdir()));fs.rmSync(root,{recursive:true,force:true});}
});
test('large-file action cannot delete a file that was not in the scan',async()=>{
  const result=await Cleaner.deleteTargetFile('C:\\unscanned.txt',{trashItem:()=>{throw new Error('Unexpected deletion');}});
  assert.equal(result.success,false);
});
