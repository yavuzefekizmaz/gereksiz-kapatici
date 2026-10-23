const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');const {OperationJournal}=require('../lib/operation-journal');
test('support export includes outcomes and errors, redacts credentials and rotates within the app data folder',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'Voldena-journal-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const journal=new OperationJournal(root,{maxBytes:200});
  journal.record('closed',{name:'anydesk.exe',outcome:'closed',password:'private',url:'https://user:password@example.com/download?token=private'});
  journal.record('failed',{reason:'EACCES'},'error');journal.record('next-operation',{id:1});
  const exportFile=journal.export(),text=fs.readFileSync(exportFile,'utf8');assert.equal(exportFile,path.join(root,'logs.txt'));assert.match(text,/EACCES/);assert.doesNotMatch(text,/private|user:password|token=private/);assert.match(text,/next-operation/);
});
