const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const execAsync = (command, options = {}) => execPromise(command, {windowsHide:true,timeout:10000,...options});

class DiskCleaner {
  /**
   * Fetches all local fixed drives (C:, D:, etc.) with total and free space.
   */
  static async getDrivesInfo() {
    try {
      const psScript = `
        Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" |
        Select-Object DeviceID, VolumeName, Size, FreeSpace |
        ConvertTo-Json -Compress
      `;
      const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
      const { stdout } = await execAsync(`powershell -NoProfile -EncodedCommand ${encoded}`, { timeout: 6000 });

      const raw = stdout.trim();
      if (!raw) return [];

      let data = JSON.parse(raw);
      if (!Array.isArray(data)) data = [data];

      return data.map(d => {
        const totalBytes = Number(d.Size || 0);
        const freeBytes = Number(d.FreeSpace || 0);
        const usedBytes = Math.max(0, totalBytes - freeBytes);

        const totalGb = Number((totalBytes / (1024 * 1024 * 1024)).toFixed(1));
        const freeGb = Number((freeBytes / (1024 * 1024 * 1024)).toFixed(1));
        const usedGb = Number((usedBytes / (1024 * 1024 * 1024)).toFixed(1));
        const usedPercent = totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0;

        return {
          letter: d.DeviceID || '',
          name: d.VolumeName ? `${d.VolumeName} (${d.DeviceID})` : `Yerel Disk (${d.DeviceID})`,
          totalGb,
          freeGb,
          usedGb,
          usedPercent
        };
      });
    } catch (err) {
      console.error('[DiskCleaner] Disk bilgileri alınamadı:', err.message);
      return [];
    }
  }

  static previews = new Map();
  static scannedFiles = new Set();
  // Only regular files immediately within these two canonical user-local directories.
  static roots() {
    const local = process.env.LOCALAPPDATA;
    if (!local || !path.isAbsolute(local)) throw new Error('Kullanıcı temp konumu doğrulanamadı.');
    const canonical = fs.realpathSync(local);
    return ['Temp','CrashDumps'].map(name=>({name,path:path.join(canonical,name)})).filter(root=>{
      if (!fs.existsSync(root.path)) return false;
      const info=fs.lstatSync(root.path);
      return info.isDirectory() && !info.isSymbolicLink() && fs.realpathSync(root.path).toLowerCase()===root.path.toLowerCase();
    });
  }
  static async getJunkSummary() {
    const files=[],categories=[];
    for(const root of this.roots()) {
      let bytes=0;
      for(const entry of await fs.promises.readdir(root.path,{withFileTypes:true})) {
        if(!entry.isFile()||entry.isSymbolicLink())continue;
        const extension=path.extname(entry.name).toLowerCase();
        if(root.name==='Temp'?!['.tmp','.temp'].includes(extension):extension!=='.dmp')continue;
        const file=path.join(root.path,entry.name);
        try {
          const stat=await fs.promises.lstat(file);
          if(!stat.isFile()||stat.isSymbolicLink()||Date.now()-stat.mtimeMs<7*86400000)continue;
          files.push({file,size:stat.size,mtime:stat.mtimeMs,ino:stat.ino,root:root.path,
            category:root.name,reason:root.name==='Temp'?'Windows kullanıcı geçici klasöründe .tmp/.temp uzantılı çalışma dosyası.':'Uygulamanın hata sırasında oluşturduğu .dmp bellek dökümü; programın çalışması için kullanılmaz.'});bytes+=stat.size;
        }catch{}
      }
      categories.push({id:root.name,name:root.path+' — yalnızca 7 günden eski '+(root.name==='Temp'?'.tmp/.temp':'.dmp')+' dosyaları',icon:'fa-solid fa-file',sizeMb:bytes/1048576,displaySize:(bytes/1048576).toFixed(1)+' MB'});
    }
    const token=require('crypto').randomUUID();
    for(const [key,value] of this.previews)if(Date.now()-value.created>120000)this.previews.delete(key);
    if(this.previews.size>=16)this.previews.delete(this.previews.keys().next().value);
    this.previews.set(token,{files,created:Date.now()});
    const totalMb=files.reduce((n,f)=>n+f.size,0)/1048576;
    return {token,totalMb,totalGb:totalMb/1024,displaySize:(totalMb/1024).toFixed(3)+' GB ('+totalMb.toFixed(1)+' MB)',categories,
      files:files.map(f=>({path:f.file,name:path.basename(f.file),bytes:f.size,modifiedAt:new Date(f.mtime).toISOString(),category:f.category,reason:f.reason}))};
  }
  static async cleanJunkFiles(token) {
    const preview=this.previews.get(token);this.previews.delete(token);
    if(!preview||Date.now()-preview.created>120000)throw new Error('Temizlik önizlemesi eskidi; yeniden tarayın.');
    const roots=new Set(this.roots().map(r=>r.path.toLowerCase()));
    let bytes=0,deletedCount=0,skippedCount=0;
    const details=[],before=new Map();
    for(const root of roots)try{const volume=path.parse(root).root;if(!before.has(volume)){const s=await fs.promises.statfs(root);before.set(volume,s.bavail*s.bsize);}}catch{}
    for(const entry of preview.files) {
      try {
        if(!roots.has(entry.root.toLowerCase())||path.dirname(entry.file)!==entry.root)throw new Error('Kapsam dışı');
        const stat=await fs.promises.lstat(entry.file);
        if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==entry.size||stat.mtimeMs!==entry.mtime||stat.ino!==entry.ino)throw new Error('Dosya değişti');
        await fs.promises.unlink(entry.file);bytes+=entry.size;deletedCount++;
        details.push({path:entry.file,bytes:entry.size,outcome:'deleted'});
      }catch(err){skippedCount++;details.push({path:entry.file,bytes:entry.size,outcome:'skipped',reason:err.code||err.message});}
    }
    let diskFreeDeltaBytes=0,measured=before.size>0;
    for(const [volume,free] of before)try{const s=await fs.promises.statfs(volume);diskFreeDeltaBytes+=s.bavail*s.bsize-free;}catch{measured=false;}
    return {success:true,freedMb:bytes/1048576,freedGb:bytes/1073741824,deletedCount,skippedCount,
      deletedBytes:bytes,diskFreeDeltaBytes:measured?diskFreeDeltaBytes:null,details,
      message:(bytes/1073741824).toFixed(3)+' GB ('+(bytes/1048576).toFixed(1)+' MB) dosya silindi; '+deletedCount+' silinen, '+skippedCount+' atlanan dosya.'};
  }

  /**
   * Scans a target folder or drive for large files (> minSizeMb), sorted descending.
   */
  static async scanLargeFiles(driveLetter = 'C:', minSizeMb = 50, limit = 60) {
    try {
      const userProfile = process.env.USERPROFILE || 'C:\\Users\\Default';
      if (!/^[A-Za-z]:$/.test(driveLetter) || !Number.isFinite(Number(minSizeMb)) || Number(minSizeMb)<1 || Number(minSizeMb)>1000000) throw new Error('Geçersiz tarama kapsamı');
      const cleanDrive = driveLetter.toUpperCase();
      const isSystemDrive = cleanDrive === 'C:';

      // Scan user areas + key gaming/media directories
      const searchRoots = [];
      if (isSystemDrive) {
        searchRoots.push(
          path.join(userProfile, 'Downloads'),
          path.join(userProfile, 'Desktop'),
          path.join(userProfile, 'Videos'),
          path.join(userProfile, 'Documents')
        );
      } else {
        searchRoots.push(`${cleanDrive}\\`);
      }

      const validRoots = searchRoots.filter(r => fs.existsSync(r));
      if (validRoots.length === 0) return [];

      const rootsFormatted = validRoots.map(r => `'${r.replace(/'/g, "''")}'`).join(', ');
      const minBytes = minSizeMb * 1024 * 1024;

      const psScript = `
        $roots = @(${rootsFormatted});
        Get-ChildItem -Path $roots -File -Recurse -ErrorAction SilentlyContinue |
          Where-Object {
            $_.Length -ge ${minBytes} -and
            $_.FullName -notmatch '\\\\(Windows|node_modules|\\.git|AppData)\\\\'
          } |
          Sort-Object Length -Descending |
          Select-Object -First ${limit} |
          Select-Object Name, FullName, Length, @{Name='LastWriteTime';Expression={$_.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss')}}, Extension |
          ConvertTo-Json -Compress
      `;

      const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
      const { stdout } = await execAsync(`powershell -NoProfile -EncodedCommand ${encoded}`, { timeout: 20000 });

      const raw = stdout.trim();
      if (!raw) return [];

      let list = JSON.parse(raw);
      if (!Array.isArray(list)) list = [list];

      this.scannedFiles.clear();
      return list.map(item => {
        this.scannedFiles.add(item.FullName);
        const bytes = Number(item.Length || 0);
        const sizeMb = Number((bytes / (1024 * 1024)).toFixed(1));
        const sizeGb = Number((sizeMb / 1024).toFixed(2));

        let displaySize = sizeMb >= 1000 ? `${sizeGb} GB` : `${sizeMb} MB`;
        let dateStr = '';
        if (item.LastWriteTime) {
          try {
            const d = new Date(item.LastWriteTime);
            if (!isNaN(d.getTime())) {
              dateStr = d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
            } else {
              dateStr = String(item.LastWriteTime).split(' ')[0] || '';
            }
          } catch (e) {
            dateStr = '';
          }
        }

        const ext = (item.Extension || path.extname(item.Name || '')).toLowerCase();
        let icon = 'fa-solid fa-file';
        let typeBadge = 'Dosya';

        if (['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2'].includes(ext)) {
          icon = 'fa-solid fa-file-zipper';
          typeBadge = 'Arşiv';
        } else if (['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm'].includes(ext)) {
          icon = 'fa-solid fa-file-video';
          typeBadge = 'Video';
        } else if (['.exe', '.msi', '.iso', '.vmdk', '.img'].includes(ext)) {
          icon = 'fa-solid fa-compact-disc';
          typeBadge = 'Yükleyici / İmaj';
        } else if (['.pdf', '.docx', '.xlsx', '.pptx', '.txt'].includes(ext)) {
          icon = 'fa-solid fa-file-lines';
          typeBadge = 'Belge';
        } else if (['.mp3', '.wav', '.flac', '.aac', '.ogg'].includes(ext)) {
          icon = 'fa-solid fa-file-audio';
          typeBadge = 'Ses';
        }

        return {
          name: item.Name || '',
          path: item.FullName || '',
          extension: ext,
          icon,
          typeBadge,
          bytes,
          sizeMb,
          sizeGb,
          displaySize,
          date: dateStr
        };
      });
    } catch (err) {
      console.error('[DiskCleaner] Büyük dosyalar taranırken hata:', err.message);
      return [];
    }
  }

  /**
   * Deletes a specific file permanently or moves to trash.
   */
  static async deleteTargetFile(filePath, shell) {
    if(!this.scannedFiles.has(filePath))return {success:false,error:'Dosya bu taramaya ait değil.'};
    try {
      const stat=await fs.promises.lstat(filePath);
      if(!stat.isFile()||stat.isSymbolicLink())throw new Error('Yalnızca normal dosyalar taşınabilir.');
      await shell.trashItem(filePath);this.scannedFiles.delete(filePath);
      return {success:true,sizeMb:stat.size/1048576,filePath};
    }catch(err){return {success:false,error:err.message};}
  }
}
module.exports=DiskCleaner;
