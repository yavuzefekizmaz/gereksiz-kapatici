const {test}=require('node:test'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');const {ExitNotice,notificationScript}=require('../lib/exit-notice');
test('desktop countdown shows once, updates the same notice each minute and removes it on cancellation',async()=>{
  const calls=[];let now=0;const notice=new ExitNotice({now:()=>now,send:async(...args)=>calls.push(args)});
  notice.sync(180000);notice.sync(180000);now=61000;notice.sync(180000);notice.sync(180000);now=121000;notice.sync(180000);notice.sync(null);await notice.chain;
  assert.deepEqual(calls,[['show',3],['update',2],['update',1],['remove',0]]);
});
test('persistent Windows reminder has a system dismiss action that cannot launch or focus the app',()=>{
  const script=notificationScript('show',3);assert.match(script,/<toast scenario="reminder">/);assert.match(script,/<action content="Bildirimi gizle" arguments="dismiss" activationType="system"\/>/);assert.doesNotMatch(script,/activationType="foreground"/);
});
test('Windows parses the bound native notification scripts without showing a notification',()=>{
  if(process.platform!=='win32')return;
  const sources=['show','update','remove'].map(action=>{const script=notificationScript(action,3);assert.match(script,/voldena-exit/);return script;});
  const payload=Buffer.from(JSON.stringify(sources)).toString('base64');
  const parser=`$sources=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${payload}'))|ConvertFrom-Json;foreach($source in $sources){$tokens=$null;$errors=$null;[System.Management.Automation.Language.Parser]::ParseInput($source,[ref]$tokens,[ref]$errors)|Out-Null;if($errors.Count){$errors|% Message;exit 1}}`;
  execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(parser,'utf16le').toString('base64')],{windowsHide:true,timeout:30000});
});
test('Windows PowerShell can build native notification data without showing a popup',()=>{
  if(process.platform!=='win32')return;
  const source="$ErrorActionPreference='Stop';[Windows.UI.Notifications.NotificationData,Windows.UI.Notifications,ContentType=WindowsRuntime]|Out-Null;$values=[System.Collections.Generic.Dictionary[string,string]]::new();$values.Add('remaining','3 dakika');$data=[Windows.UI.Notifications.NotificationData]::new($values);if($null -eq $data){exit 1}";
  execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(source,'utf16le').toString('base64')],{windowsHide:true,timeout:30000});
});
