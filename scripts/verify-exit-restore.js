// Integration test: every executable and terminated PID belongs to this private fixture folder.
const fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process'),assert=require('assert/strict');
const Scanner=require('../lib/app-scanner');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'Voldena-exit-restore-'));
const gameFile=path.join(root,'VoldenaTestGame.exe'),restoreFile=path.join(root,'VoldenaTestRestore.exe');
const source=path.join(root,'fixture.cs');
fs.writeFileSync(source,`using System;using System.Drawing;using System.Windows.Forms;class F:Form{protected override bool ShowWithoutActivation{get{return true;}}[STAThread]static void Main(){var f=new F();f.Size=new Size(1,1);f.Location=new Point(-10000,-10000);f.StartPosition=FormStartPosition.Manual;Application.Run(f);}}`);
cp.execFileSync(path.join(process.env.WINDIR,'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),['/nologo','/target:winexe','/reference:System.Windows.Forms.dll','/reference:System.Drawing.dll','/out:'+gameFile,source],{windowsHide:true});
fs.copyFileSync(gameFile,restoreFile);
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function rows(){return Scanner.getRunningProcesses({throwOnError:true,currentSessionOnly:true});}
async function arm(game){
  const modulePath=path.resolve(__dirname,'../lib/exit-restore.js');
  const input={directory:root,games:[{pid:game.pid,startedAt:game.startedAt}],targets:[{path:restoreFile}]};
  const script=`require(process.argv[1]).armExitRestore(JSON.parse(process.argv[2])).then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(error.message);process.exitCode=1;})`;
  const output=cp.execFileSync(process.execPath,['-e',script,modulePath,JSON.stringify(input)],{windowsHide:true,timeout:20000,encoding:'utf8'});
  return JSON.parse(output.trim());
}
(async()=>{
  try{
    const game=cp.spawn(gameFile,[],{stdio:'ignore',windowsHide:true});await wait(1200);
    const identity=(await rows()).find(row=>row.pid===game.pid);assert.ok(identity?.startedAt);
    const armed=await arm(identity);assert.equal(armed.armed,true);
    assert.equal((await rows()).filter(row=>row.path===restoreFile).length,0,'Restored before the game ended');
    // The helper that armed the watcher has already exited. Only our test game is stopped.
    game.kill();
    for(let n=0;n<14;n++){if(fs.existsSync(armed.reportPath))break;await wait(1000);}
    const restored=(await rows()).filter(row=>row.path?.toLowerCase()===restoreFile.toLowerCase());assert.equal(restored.length,1);
    const result=JSON.parse(fs.readFileSync(armed.reportPath,'utf8').replace(/^\uFEFF/,''));assert.ok(result.some(item=>item.outcome==='launched'));
    const again=await arm(identity);for(let n=0;n<10&&!fs.existsSync(again.reportPath);n++)await wait(1000);
    assert.equal((await rows()).filter(row=>row.path?.toLowerCase()===restoreFile.toLowerCase()).length,1,'Duplicate restored app');
    console.log('Verified selected restore after the parent exits, exact game PID/start time, game-end timing and duplicate prevention.');
  }finally{
    for(const row of await rows())if([gameFile.toLowerCase(),restoreFile.toLowerCase()].includes(row.path?.toLowerCase()))try{process.kill(row.pid);}catch{}
  }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
