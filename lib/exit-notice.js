const {execFile}=require('node:child_process');
// Update changes the existing tagged notification's bound data, without a new banner.
// https://learn.microsoft.com/uwp/api/windows.ui.notifications.toastnotifier.update
function notificationScript(action,minutes){
  if(!['show','update','remove'].includes(action)||!Number.isInteger(minutes)||minutes<0||minutes>60)throw Error('Invalid notice');
  return `$ErrorActionPreference='Stop';
[Windows.UI.Notifications.ToastNotificationManager,Windows.UI.Notifications,ContentType=WindowsRuntime]|Out-Null;
[Windows.UI.Notifications.NotificationData,Windows.UI.Notifications,ContentType=WindowsRuntime]|Out-Null;
$id='com.voldena.gamebooster';$tag='voldena-exit';$group='optimization';
${action==='remove'?"[Windows.UI.Notifications.ToastNotificationManager]::History.Remove($tag,$group,$id);":`
$values=[System.Collections.Generic.Dictionary[string,string]]::new();$values.Add('remaining','Voldena ${minutes} dk sonra kapanacak');$data=[Windows.UI.Notifications.NotificationData]::new($values);
$notifier=[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($id);
${action==='show'?`
[Windows.Data.Xml.Dom.XmlDocument,Windows.Data.Xml.Dom.XmlDocument,ContentType=WindowsRuntime]|Out-Null;
$xml=[Windows.Data.Xml.Dom.XmlDocument]::new();$xml.LoadXml('<toast scenario="reminder"><visual><binding template="ToastGeneric"><text>{remaining}</text><text>İşlemler tamamlandı. Oyun açık kalacak.</text></binding></visual><audio silent="true"/></toast>');
$toast=[Windows.UI.Notifications.ToastNotification]::new($xml);$toast.Tag=$tag;$toast.Group=$group;$toast.Data=$data;$toast.ExpirationTime=[DateTimeOffset]::Now.AddMinutes(${minutes});$notifier.Show($toast);
`:"$result=$notifier.Update($data,$tag,$group);if($result.ToString() -ne 'Succeeded'){throw ('Notification update: '+$result)}"}`}`;
}
function sendNative(action,minutes){return new Promise((resolve,reject)=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(notificationScript(action,minutes),'utf16le').toString('base64')],{windowsHide:true,timeout:10000},error=>error?reject(error):resolve()));}
class ExitNotice{
  constructor({send=sendNative,now=Date.now,log=()=>{}}={}){this.send=send;this.now=now;this.log=log;this.deadline=null;this.minute=null;this.chain=Promise.resolve();}
  queue(action,minutes){this.chain=this.chain.then(()=>this.send(action,minutes)).catch(error=>this.log('exit-notice-error',{action,message:error.message}));return this.chain;}
  sync(deadline,enabled=true){
    if(!enabled||!deadline){if(this.deadline){this.queue('remove',0);this.deadline=null;this.minute=null;}return;}
    const minutes=Math.max(1,Math.ceil((deadline-this.now())/60000));
    if(!this.deadline){this.deadline=deadline;this.minute=minutes;this.queue('show',minutes);}
    else{this.deadline=deadline;if(minutes!==this.minute){this.minute=minutes;this.queue('update',minutes);}}
  }
}
module.exports={ExitNotice,notificationScript};
