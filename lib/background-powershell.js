const {spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
// Start-Process gives the watchdog its own hidden console lifetime. A detached
// PowerShell host can silently exit, while an inherited console dies with its parent.
function spawnBackgroundPowerShell(encoded,spawnProcess=spawn){
  if(!/^[A-Za-z0-9+/=]+$/.test(encoded))throw Error('Invalid encoded worker');
  const file=path.join(os.tmpdir(),'Voldena-worker-'+crypto.randomUUID()+'.b64');
  fs.writeFileSync(file,encoded,{flag:'wx'});
  const literal=file.replace(/'/g,"''");
  const launcher=`$ErrorActionPreference='Stop';$worker=[IO.File]::ReadAllText('${literal}');try {Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList @('-NoProfile','-NonInteractive','-EncodedCommand',$worker) -WindowStyle Hidden -PassThru | Out-Null} finally {Remove-Item -LiteralPath '${literal}' -ErrorAction SilentlyContinue}`;
  return spawnProcess('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(launcher,'utf16le').toString('base64')],{windowsHide:true,detached:false,stdio:'ignore'});
}
module.exports={spawnBackgroundPowerShell};
