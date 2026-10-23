const path=require('node:path'),fs=require('node:fs');
const systemName=/^(system|idle|registry|svchost|csrss|smss|wininit|services|lsass|winlogon|dwm|explorer|runtimebroker|dllhost|conhost|sihost|taskhostw|audiodg|searchhost|searchindexer|spoolsv|ctfmon)(\.exe)?$/i;
class AppIcons{
  constructor(app,scanner){this.app=app;this.scanner=scanner;this.cache=new Map();}
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
  async batch(targets){if(!Array.isArray(targets)||targets.length>100)throw Error('Geçersiz simge isteği');return Object.fromEntries(await Promise.all(targets.map(async target=>[target,await this.get(target)])));}
}
module.exports={AppIcons,systemName};
