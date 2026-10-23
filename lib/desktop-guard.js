const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
class DesktopGuard {
  constructor(directory,{spawnProcess=spawn,wait=ms=>new Promise(r=>setTimeout(r,ms))}={}){
    Object.assign(this,{directory,spawnProcess,wait});this.state=null;
  }
  get active(){return !!this.state&&!fs.existsSync(this.state.base+'.done');}
  async acquire(gameNames){
    const names=gameNames.filter(n=>/^[\w .-]+\.exe$/i.test(n)).map(n=>n.toLowerCase().replace(/\.exe$/,''));
    if(!names.length)throw Error('Explorer için açık oyun/uygulama doğrulanamadı.');
    if(this.active){this.state.names=[...new Set([...this.state.names,...names])];fs.writeFileSync(this.state.base+'.json',JSON.stringify(this.state.names));return;}
    const base=path.join(this.directory,'desktop-guard-'+crypto.randomUUID());
    fs.mkdirSync(this.directory,{recursive:true});fs.writeFileSync(base+'.json',JSON.stringify(names));
    const payload=Buffer.from(JSON.stringify({base,parentPid:process.pid})).toString('base64');
    const source=fs.readFileSync(path.join(__dirname,'desktop-guard.ps1'),'utf8');
    const encoded=Buffer.from(`& { ${source}\n } -Payload '${payload}'`,'utf16le').toString('base64');
    this.state={base,names};
    try {
      await new Promise((resolve,reject)=>{const child=require('./background-powershell').spawnBackgroundPowerShell(encoded,this.spawnProcess);child.once('error',reject);child.once('spawn',()=>{child.unref();resolve();});});
      for(let i=0;i<80;i++){if(fs.existsSync(base+'.ready'))return;if(fs.existsSync(base+'.done'))throw Error('Masaüstü koruyucusu işlemi durdurdu.');await this.wait(100);}
      throw Error('Masaüstü koruyucusu başlatılamadı; kapatma iptal edildi.');
    }catch(err){this.requestRestore();throw err;}
  }
  requestRestore(){if(this.active)try{fs.writeFileSync(this.state.base+'.restore','restore');}catch(error){console.warn('Kurtarma isteği dosyası yazılamadı:',error.message);}}
}
module.exports=DesktopGuard;
