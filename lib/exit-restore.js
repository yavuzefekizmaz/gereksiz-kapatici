const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
async function armExitRestore({directory,games,targets,spawnProcess=spawn,wait=ms=>new Promise(r=>setTimeout(r,ms))}){
  if(!games.length||!targets.length)throw Error('Oyun kimliği veya geri açılacak uygulama eksik.');
  if(games.some(game=>!Number.isSafeInteger(game.pid)||!/^\d+$/.test(game.startedAt)))throw Error('Oyun kimliği doğrulanamadı.');
  if(targets.some(target=>!path.isAbsolute(target.path)||!/\.exe$/i.test(target.path)))throw Error('Geri açılacak uygulamanın tam EXE konumu gerekli.');
  fs.mkdirSync(directory,{recursive:true});
  const base=path.join(directory,'exit-restore-'+crypto.randomUUID());
  const source=fs.readFileSync(path.join(__dirname,'exit-restore.ps1'),'utf8');
  const payload=Buffer.from(JSON.stringify({base,games,targets})).toString('base64');
  const encoded=Buffer.from(`& { ${source}\n } -Payload '${payload}'`,'utf16le').toString('base64');
  await new Promise((resolve,reject)=>{const child=require('./background-powershell').spawnBackgroundPowerShell(encoded,spawnProcess);child.once('error',reject);child.once('spawn',()=>{child.unref();resolve();});});
  for(let n=0;n<100;n++){if(fs.existsSync(base+'.ready'))return {armed:true,reportPath:base+'.result.json'};if(fs.existsSync(base+'.result.json'))throw Error('Oyun bitiş izleyicisi başlatılamadı.');await wait(100);}
  fs.writeFileSync(base+'.cancel','cancel');throw Error('Oyun bitiş izleyicisi başlatılamadı.');
}
module.exports={armExitRestore};
