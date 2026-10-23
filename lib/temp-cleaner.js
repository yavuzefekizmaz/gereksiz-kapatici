const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const inside=(file,root)=>{const relative=path.relative(root,file);return !!relative&&!relative.startsWith('..')&&!path.isAbsolute(relative);};
class TempCleaner{
  static previews=new Map();
  static roots(){
    const local=process.env.LOCALAPPDATA;if(!local||!path.isAbsolute(local))throw Error('Kullanıcı geçici klasörü doğrulanamadı.');
    const canonical=fs.realpathSync(local);
    const candidates=[{name:'Temp',path:path.join(canonical,'Temp'),extensions:['.tmp','.temp','.log','.etl'],days:7},{name:'CrashDumps',path:path.join(canonical,'CrashDumps'),extensions:['.dmp','.hdmp'],days:7}];
    if(canonical.toLowerCase()===path.join(os.homedir(),'AppData','Local').toLowerCase()){
      candidates.push({name:'Hata raporları',path:path.join(canonical,'Microsoft','Windows','WER','ReportArchive'),extensions:['.dmp','.hdmp','.wer','.tmp'],days:30});
      if(process.env.WINDIR)candidates.push({name:'Windows geçici dosyaları',path:path.join(process.env.WINDIR,'Temp'),extensions:['.tmp','.temp','.log','.etl'],days:7});
    }
    return candidates.filter(root=>{try{const stat=fs.lstatSync(root.path);return stat.isDirectory()&&!stat.isSymbolicLink()&&fs.realpathSync(root.path).toLowerCase()===root.path.toLowerCase();}catch{return false;}});
  }
  static async getJunkSummary(drive=null){
    if(drive!==null&&!/^[a-z]:$/i.test(drive))throw Error('Geçersiz sürücü');
    const allRoots=this.roots(),roots=allRoots.filter(root=>!drive||path.parse(root.path).root.slice(0,2).toLowerCase()===drive.toLowerCase());
    const files=[],categories=[],diagnostics=[];const started=Date.now();
    for(const root of roots){
      let bytes=0;const diagnostic={path:root.path,examined:0,recent:0,otherTypes:0,directories:0,links:0,errors:0,status:'complete'};diagnostics.push(diagnostic);
      const queue=[{directory:root.path,depth:0}];
      while(queue.length){
        if(diagnostic.examined>=40000||Date.now()-started>15000){diagnostic.status='partial';diagnostic.error='Tarama sınırına ulaşıldı; kontrol edilmeyen dosyalar silinmez.';break;}
        const {directory,depth}=queue.shift();let entries;
        try{if(!this.validDirectory(directory,root.path))throw Error('Klasör bağlantısı atlandı');entries=await fs.promises.readdir(directory,{withFileTypes:true});}
        catch(error){diagnostic.errors++;diagnostic.status='partial';diagnostic.error=error.code||error.message;continue;}
        for(const entry of entries){
          if(entry.isSymbolicLink()){diagnostic.links++;continue;}
          const file=path.join(directory,entry.name);
          if(entry.isDirectory()){diagnostic.directories++;if(depth<12)queue.push({directory:file,depth:depth+1});else{diagnostic.status='partial';diagnostic.error='Derin klasör sınırı';}continue;}
          if(!entry.isFile())continue;diagnostic.examined++;
          if(!root.extensions.includes(path.extname(entry.name).toLowerCase())){diagnostic.otherTypes++;continue;}
          try{
            const stat=await fs.promises.lstat(file);if(!stat.isFile()||stat.isSymbolicLink())continue;
            if(Date.now()-stat.mtimeMs<root.days*86400000){diagnostic.recent++;continue;}
            const reason=root.name==='CrashDumps'||root.name==='Hata raporları'?'Eski hata inceleme raporu veya bellek dökümü; uygulamanın çalışması için gerekmez. Hata incelemesi yapacaksanız saklayın.':'Bilinen geçici klasördeki eski çalışma dosyası veya tanılama günlüğü; kişisel belge ya da program dosyası değildir.';
            files.push({file,size:stat.size,mtime:stat.mtimeMs,ino:stat.ino,root:root.path,category:root.name,days:root.days,reason});bytes+=stat.size;
          }catch(error){diagnostic.errors++;diagnostic.status='partial';}
        }
      }
      categories.push({id:root.name,name:root.name,path:root.path,description:`${root.days} günden eski ${root.extensions.join(', ')} · alt klasörler dahil`,icon:'fa-solid fa-file',sizeMb:bytes/1048576,displaySize:(bytes/1048576).toFixed(1)+' MB'});
    }
    const token=crypto.randomUUID();for(const [key,value] of this.previews)if(Date.now()-value.created>300000)this.previews.delete(key);
    if(this.previews.size>=16)this.previews.delete(this.previews.keys().next().value);this.previews.set(token,{files,created:Date.now()});
    const totalMb=files.reduce((sum,file)=>sum+file.size,0)/1048576;
    return {token,totalMb,totalGb:totalMb/1024,displaySize:(totalMb/1024).toFixed(3)+' GB ('+totalMb.toFixed(1)+' MB)',categories,diagnostics,drive,availableDrives:[...new Set(allRoots.map(root=>path.parse(root.path).root.slice(0,2)))],complete:diagnostics.every(item=>item.status==='complete'),scope:'Yalnızca doğrulanmış geçici klasörlerdeki eski geçici dosyalar ve hata günlükleri; bağlantılar izlenmez.',files:files.map(file=>({path:file.file,name:path.basename(file.file),bytes:file.size,modifiedAt:new Date(file.mtime).toISOString(),category:file.category,days:file.days,reason:file.reason}))};
  }
  static validDirectory(directory,root){
    if(directory!==root&&!inside(directory,root))return false;
    let current=directory;
    for(;;){const stat=fs.lstatSync(current);if(!stat.isDirectory()||stat.isSymbolicLink()||fs.realpathSync(current).toLowerCase()!==current.toLowerCase())return false;if(current===root)return true;current=path.dirname(current);}
  }
  static async cleanJunkFiles(token){
    const preview=this.previews.get(token);this.previews.delete(token);
    if(!preview||Date.now()-preview.created>300000)throw Error('Temizlik önizlemesi eskidi; yeniden tarayın.');
    const roots=new Set(this.roots().map(root=>root.path));let bytes=0,deletedCount=0,skippedCount=0;const details=[],before=new Map();
    for(const root of roots)try{const volume=path.parse(root).root;if(!before.has(volume)){const stat=await fs.promises.statfs(root);before.set(volume,stat.bavail*stat.bsize);}}catch{}
    for(const entry of preview.files){
      try{
        if(!roots.has(entry.root)||!inside(entry.file,entry.root)||!this.validDirectory(path.dirname(entry.file),entry.root))throw Error('Kapsam veya klasör değişti');
        const stat=await fs.promises.lstat(entry.file);
        if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==entry.size||stat.mtimeMs!==entry.mtime||stat.ino!==entry.ino)throw Error('Dosya değişti');
        await fs.promises.unlink(entry.file);bytes+=entry.size;deletedCount++;details.push({path:entry.file,bytes:entry.size,outcome:'deleted'});
      }catch(error){skippedCount++;details.push({path:entry.file,bytes:entry.size,outcome:'skipped',reason:error.code||error.message});}
    }
    let diskFreeDeltaBytes=0,measured=before.size>0;
    for(const [volume,free] of before)try{const stat=await fs.promises.statfs(volume);diskFreeDeltaBytes+=stat.bavail*stat.bsize-free;}catch{measured=false;}
    return {success:true,freedMb:bytes/1048576,freedGb:bytes/1073741824,deletedCount,skippedCount,deletedBytes:bytes,diskFreeDeltaBytes:measured?diskFreeDeltaBytes:null,details,message:(bytes/1073741824).toFixed(3)+' GB ('+(bytes/1048576).toFixed(1)+' MB) dosya silindi; '+deletedCount+' silinen, '+skippedCount+' atlanan dosya.'};
  }
}
module.exports=TempCleaner;
