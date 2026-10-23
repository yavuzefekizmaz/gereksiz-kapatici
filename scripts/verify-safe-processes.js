// Creates its own two harmless GUI processes; all closing is restricted to their exact paths.
const fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process');
const assert=require('assert/strict');
const Optimizer=require('../lib/ram-optimizer'),Scanner=require('../lib/app-scanner');
const root=process.env.VOLDENA_FIXTURE_ROOT||fs.mkdtempSync(path.join(os.tmpdir(),'Voldena-process-test-'));
fs.mkdirSync(root,{recursive:true});
const spotify=path.join(root,'spotify.exe'),companion=path.join(root,'VoldenaSafeCompanion.exe');
const source=path.join(root,'fixture.cs');
fs.writeFileSync(source,`using System;using System.Drawing;using System.Windows.Forms;
class QuietForm:Form { protected override bool ShowWithoutActivation {get{return true;}}
[STAThread] static void Main(){var f=new QuietForm();f.Text="Voldena safe test";f.Size=new Size(1,1);f.StartPosition=FormStartPosition.Manual;f.Location=new Point(-10000,-10000);Application.Run(f);}}`);
const csc=path.join(process.env.WINDIR,'Microsoft.NET','Framework64','v4.0.30319','csc.exe');
cp.execFileSync(csc,['/nologo','/target:winexe','/reference:System.Windows.Forms.dll','/reference:System.Drawing.dll','/out:'+spotify,source],{windowsHide:true});
fs.copyFileSync(spotify,companion);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function cleanup() {
  const script=`$paths=@('${spotify.replace(/'/g,"''")}','${companion.replace(/'/g,"''")}'); Get-Process | Where-Object {$paths -contains $_.Path} | ForEach-Object { $p=$_; if(!$p.CloseMainWindow() -or !$p.WaitForExit(1000)){ $current=Get-Process -Id $p.Id -ErrorAction SilentlyContinue; if($current -and $paths -contains $current.Path -and $current.StartTime -eq $p.StartTime){$current.Kill()} } }`;
  cp.execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:10000});
}
(async()=>{
  try {
    const child=cp.spawn(spotify,[],{windowsHide:true,stdio:'ignore'});child.on('error',err=>{throw err;});
    await delay(1500);
    const result=await Optimizer.killProcesses(['spotify.exe'],[],{allowedPaths:[spotify]});
    assert.ok(result.killed.includes('spotify.exe'),'Harmless fixture did not close normally');
    assert.ok(result.closedApps.every(item=>item.path.toLowerCase()===spotify.toLowerCase()));
    await Optimizer.relaunchProcesses(result.closedApps);await delay(1300);
    assert.equal((await Scanner.getRunningProcesses({throwOnError:true})).filter(p=>p.path?.toLowerCase()===spotify.toLowerCase()).length,1,'Confirmed closed fixture was not restored');
    await Optimizer.relaunchProcesses(result.closedApps);
    assert.equal((await Scanner.getRunningProcesses({throwOnError:true})).filter(p=>p.path?.toLowerCase()===spotify.toLowerCase()).length,1,'Restore duplicated an already open fixture');
    assert.equal(await Optimizer.launchTarget(companion),true);await delay(1500);
    assert.equal(await Optimizer.launchTarget(companion),false);
    const processes=await Scanner.getRunningProcesses({throwOnError:true});
    assert.equal(processes.filter(p=>p.path?.toLowerCase()===companion.toLowerCase()).length,1);
    fs.writeFileSync(path.join(root,'result.json'),JSON.stringify({safeWindowClosed:true,companionLaunchedOnce:true,secondLaunchSkipped:true,report:result.details},null,2));
    console.log('Verified real same-session normal close and companion duplicate prevention using path-restricted harmless fixtures.');
  } finally {await cleanup();}
})().catch(err=>{console.error(err.message);process.exitCode=1;});
