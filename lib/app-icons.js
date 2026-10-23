const path=require('node:path'),fs=require('node:fs');
const systemName=/^(system|idle|registry|svchost|csrss|smss|wininit|services|lsass|winlogon|dwm|explorer|runtimebroker|dllhost|conhost|sihost|taskhostw|audiodg|searchhost|searchindexer|spoolsv|ctfmon)(\.exe)?$/i;
class AppIcons{
  constructor(app,scanner,{hydrate=true}={}){this.app=app;this.scanner=scanner;this.cache=new Map();this.hydrate=hydrate;this.inventory=null;}
  async prepare(){
    if(!this.hydrate)return;
    if(!this.inventory)this.inventory=(async()=>{
      // One shared read of known app/process locations; never resolve or launch a shortcut.
      const results=await Promise.allSettled([this.scanner.getInstalledApps?.(),this.scanner.getRunningProcesses?.({currentSessionOnly:true,minimal:true})]);
      for(const result of results)if(result.status==='fulfilled')for(const row of result.value||[]){
        if(!row.path||!path.isAbsolute(row.path)||!/\.exe$/i.test(row.path))continue;
        for(const name of [row.exe,row.name,path.basename(row.path)])if(name){
          const key=name.toLowerCase();
          if(!this.scanner.resolvedPathCache.has(key))this.scanner.resolvedPathCache.set(key,row.path);
          if(!/\.exe$/i.test(key)&&!this.scanner.resolvedPathCache.has(key+'.exe'))this.scanner.resolvedPathCache.set(key+'.exe',row.path);
        }
      }
    })();
    await this.inventory;
  }
  async get(target){
    if(typeof target!=='string'||target.length>1000||systemName.test(target))return null;
    // Icons only read known local executable files. No process or shell is started.
    let file=path.isAbsolute(target)?target:this.scanner.resolvedPathCache.get(target.toLowerCase())||this.scanner.resolvedPathCache.get(target.toLowerCase().replace(/\.exe$/,'')+'.exe');
    if(!file||!path.isAbsolute(file)||!/\.exe$/i.test(file)||systemName.test(path.basename(file))||file.toLowerCase().startsWith((process.env.WINDIR||'C:\\Windows').toLowerCase()+'\\'))return null;
    const key=file.toLowerCase();if(this.cache.has(key))return this.cache.get(key);
    if(this.cache.size>512)this.cache.delete(this.cache.keys().next().value);
    const result=(async()=>{try{if(!fs.statSync(file).isFile())return null;const icon=await this.app.getFileIcon(file,{size:'small'});return icon.isEmpty()?null:icon.toDataURL();}catch{return null;}})();
    this.cache.set(key,result);return result;
  }
  async batch(targets){if(!Array.isArray(targets)||targets.length>100)throw Error('Geçersiz simge isteği');if(targets.some(target=>typeof target==='string'&&!systemName.test(target)))await this.prepare();return Object.fromEntries(await Promise.all(targets.map(async target=>[target,await this.get(target)])));}
}
module.exports={AppIcons,systemName};
