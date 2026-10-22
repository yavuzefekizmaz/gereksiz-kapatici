const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const semver = require('semver');
const yaml = require('js-yaml');
const { autoUpdater } = require('electron-updater');
const UpdateManager = require('./update-manager');
const { launchUpdateInstaller } = require('./update-installer');
const repo = 'yavuzefekizmaz/gereksiz-kapatici';
function get(url, redirects = 5) {
  return new Promise((resolve,reject) => {
    if (!url.startsWith('https://') || redirects < 0) return reject(new Error('Güvenli indirme adresi gerekli.'));
    const req = https.get(url,{headers:{'User-Agent':'Voldena-Updater','Accept':'application/vnd.github+json'}},res=>{
      if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location) {
        res.resume(); return get(new URL(res.headers.location,url).href,redirects-1).then(resolve,reject);
      }
      if(res.statusCode!==200){res.resume();return reject(new Error(`GitHub HTTP ${res.statusCode}`));}
      const chunks=[];let size=0;
      res.on('data',chunk=>{size+=chunk.length;if(size>4*1024*1024)res.destroy(new Error('Metadata çok büyük.'));else chunks.push(chunk);});
      res.on('error',reject);res.on('end',()=>resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.setTimeout(15000,()=>req.destroy(new Error('GitHub bağlantısı zaman aşımına uğradı.')));req.on('error',reject);
  });
}
module.exports = function({app, mainWindow, processMonitor, quit}) {
  let busy = false;
  const exe = app.getPath('exe');
  const launchInstaller=(info,target)=>launchUpdateInstaller(info,target,undefined,{
    allUsers:!!process.env.ProgramFiles && target.toLowerCase().startsWith(process.env.ProgramFiles.toLowerCase()+'\\'),
    reportPath:path.join(app.getPath('userData'),'update-result.json')});
  const supported = app.isPackaged && !process.env.PORTABLE_EXECUTABLE_FILE && fs.existsSync(path.join(path.dirname(exe),'Uninstall Voldena Oyun Hizlandiricisi.exe'));
  const log = (message) => {
    // No URLs, command lines, tokens or personal file paths in diagnostics.
    try { fs.appendFileSync(path.join(app.getPath('userData'),'update.log'),`${new Date().toISOString()} ${message}\n`); } catch {}
  };
  autoUpdater.logger = {info:()=>{},warn:()=>{},error:()=>{},debug:()=>{}};
  autoUpdater.setFeedURL({provider:'github',owner:'yavuzefekizmaz',repo:'gereksiz-kapatici'});
  const manager = new UpdateManager({app, updater:autoUpdater, supported, launchInstaller,
    beforeInstall:()=> !processMonitor.isProcessing && !processMonitor.activeRuleId,
    prepareToQuit:()=>{processMonitor.setInstalling(true);quit();},
    notify:state=>{log(`status=${state.status}`);if(state.status==='downloading')mainWindow.webContents.send('github-update-progress',{percent:state.progress});},
    logger:{info:()=>log('Installer process started; completion pending.'),error:()=>log('Installer launch failed; app retained.')} });
  const installInfo=()=>{
    let lastUpdate=null;try{lastUpdate=JSON.parse(fs.readFileSync(path.join(app.getPath('userData'),'update-result.json'),'utf8').replace(/^\uFEFF/,''));}catch{}
    return {type:supported?'setup':app.isPackaged?'portable':'development',exe,version:app.getVersion(),userData:app.getPath('userData'),lastUpdate};
  };
  async function check() {
    // Portable still checks releases, but never silently installs a setup.
    const release=JSON.parse(await get(`https://api.github.com/repos/${repo}/releases/latest`));
    const version=semver.valid(String(release.tag_name).replace(/^v/,''));
    if(!version)throw new Error('Geçersiz yayın sürümü.');
    const expected=supported?`Voldena.Oyun.Hizlandiricisi.Setup.${version}.exe`:`Voldena.Oyun.Hizlandiricisi.${version}.exe`;
    const asset=release.assets?.find(a=>a.name===expected);
    if(!asset)throw new Error('Bu sürüme ait doğru paket yayında bulunamadı.');
    if(supported)await manager.check();
    return {hasUpdate:semver.gt(version,app.getVersion()),currentVersion:app.getVersion(),latestVersion:version,
      downloadUrl:asset.browser_download_url,fileName:asset.name,sizeMb:(asset.size/1048576).toFixed(1),
      releaseNotes:release.body,htmlUrl:release.html_url,
      message:supported?'Güncel sürüm kullanılıyor.':'Portable: yeni EXE için GitHub sürüm sayfasını açın.',portable:!supported};
  }
  async function validatedLocal(file) {
    if(typeof file!=='string'||!path.isAbsolute(file))throw new Error('Kurulum dosyası seçin.');
    const match=path.basename(file).match(/^Voldena\.Oyun\.Hizlandiricisi\.Setup\.(\d+\.\d+\.\d+)\.exe$/);
    if(!match||!semver.gt(match[1],app.getVersion()))throw new Error('Doğru ürüne ait daha yeni bir setup seçin.');
    const version=match[1];
    const release=JSON.parse(await get(`https://api.github.com/repos/${repo}/releases/tags/v${version}`));
    if(release.draft||release.prerelease)throw new Error('Kararlı ve yayımlanmış bir kurulum gerekli.');
    const meta=release.assets.find(a=>a.name==='latest.yml');
    if(!meta)throw new Error('Yayının doğrulama metadatası bulunamadı.');
    const metadata=yaml.load(await get(meta.browser_download_url));
    if(metadata.version!==version)throw new Error('Yayın sürümü ile metadata eşleşmiyor.');
    const expected=metadata.files?.find(f=>f.url===path.basename(file));
    if(!expected?.sha512)throw new Error('Setup doğrulama bilgisi yok.');
    const hash=crypto.createHash('sha512');for await(const chunk of fs.createReadStream(file))hash.update(chunk);
    if(hash.digest('base64')!==expected.sha512)throw new Error('Setup bütünlüğü doğrulanamadı.');
    return {downloadedFile:file,version,files:[expected]};
  }
  async function applyLocal(file) {
    if(!supported)return {success:false,error:'Bu kopya kurulu setup değil. Portable dosya için sürüm sayfasını kullanın.'};
    if(busy)return {success:false,error:'Başka bir güncelleme işlemi sürüyor.'};
    busy=true;
    try {
      if(processMonitor.isProcessing||processMonitor.activeRuleId||(await processMonitor.detectRunningGameNow()).isRunning)throw new Error('Kurulumdan önce oyunu ve süren işlemleri kapatın.');
      const info=await validatedLocal(file);
      processMonitor.setInstalling(true);
      await launchInstaller(info,exe);
      log('Local installer process started; completion pending.');quit();return {success:true};
    } catch(err){log('Local update failed; app retained.');return {success:false,error:err.message};}
    finally {processMonitor.setInstalling(false);busy=false;}
  }
  async function downloadAndInstall() {
    if(!supported)return {success:false,error:'Portable sürümde yeni EXE’yi GitHub sürüm sayfasından indirin.'};
    if(busy)return {success:false,error:'Başka bir güncelleme işlemi sürüyor.'};
    busy=true;processMonitor.setInstalling(true);
    try {
      if((await processMonitor.detectRunningGameNow()).isRunning||processMonitor.isProcessing)throw new Error('Güncellemeden önce oyunu kapatın.');
      if(manager.state.status!=='downloaded') {
        await manager.check();
        if(manager.state.status!=='available')throw new Error(manager.state.message);
        await manager.download();
      }
      if(manager.state.status!=='downloaded')throw new Error(manager.state.message);
      await manager.install();
      if(manager.state.status!=='installing')throw new Error(manager.state.message);
      return {success:true};
    }catch(err){log('Update failed; app retained.');return {success:false,error:err.message};}
    finally{busy=false;processMonitor.setInstalling(false);}
  }
  async function describe(file) {
    const info=await validatedLocal(file);return {filePath:file,fileName:path.basename(file),fileVersion:info.version,sizeMb:(fs.statSync(file).size/1048576).toFixed(1)};
  }
  return {installInfo,check,applyLocal,downloadAndInstall,
    async selectLocal(dialog){const result=await dialog.showOpenDialog(mainWindow,{properties:['openFile'],filters:[{name:'Voldena Setup',extensions:['exe']}]});return result.canceled?null:describe(result.filePaths[0]);},
    async checkLocal(){
      const dirs=[path.join(path.dirname(exe),'dist'),path.join(app.getAppPath(),'..','..','..','dist'),path.join(process.cwd(),'dist')];
      const files=[...new Set(dirs)].flatMap(dir=>fs.existsSync(dir)?fs.readdirSync(dir).filter(f=>/^Voldena\.Oyun\.Hizlandiricisi\.Setup\.\d+\.\d+\.\d+\.exe$/.test(f)).map(f=>path.join(dir,f)):[]);
      files.sort((a,b)=>semver.rcompare(path.basename(a).match(/\d+\.\d+\.\d+/)[0],path.basename(b).match(/\d+\.\d+\.\d+/)[0]));
      const newer=files.find(f=>semver.gt(path.basename(f).match(/\d+\.\d+\.\d+/)[0],app.getVersion()));
      if(!newer)return {hasUpdate:false,currentVersion:app.getVersion(),message:'dist/ içinde daha yeni setup bulunamadı.'};
      const info=await describe(newer);return {...info,hasUpdate:true,latestVersion:info.fileVersion,currentVersion:app.getVersion()};
    }};
};
