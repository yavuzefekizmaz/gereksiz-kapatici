(function () {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const format = bytes => `${(bytes / 1073741824).toFixed(3)} GB · ${(bytes / 1048576).toFixed(1)} MB`;
  window.openCleanupPreview = async function (drive=null) {
    const api=window.voldenaAPI,modal=document.getElementById('modal-cleanup');
    const list=document.getElementById('cleanup-files'),summary=document.getElementById('cleanup-summary');
    const start=document.getElementById('cleanup-start'),close=document.getElementById('cleanup-close');
    modal.classList.add('active');start.disabled=true;
    start.textContent='Listedeki geçici dosyaları temizle';close.textContent='Vazgeç';close.disabled=false;
    document.getElementById('cleanup-disk-result').textContent='';
    summary.textContent='Dosyalar kontrol ediliyor… Hiçbir dosya silinmedi.';list.replaceChildren();
    let preview;
    try {
      preview=await api.getJunkSummary(drive);
      summary.textContent=`${preview.files.length} geçici dosya adayı · ${preview.displaySize}`;
      const fragment=document.createDocumentFragment();
      for(const file of preview.files){
        const row=document.createElement('div');row.className='cleanup-file';
        row.innerHTML=`<div class="cleanup-file-heading"><strong>${escape(file.name)}</strong><span>${format(file.bytes)}</span></div><code>${escape(file.path)}</code><p>${escape(file.reason)} En az ${file.days||7} gündür değişmemiş. Son değişiklik: ${escape(new Date(file.modifiedAt).toLocaleDateString('tr-TR'))}.</p>`;
        fragment.appendChild(row);
      }
      list.appendChild(fragment);start.disabled=!preview.files.length;
      if(!preview.files.length)list.textContent=preview.complete?'Tarama tamamlandı. Bu kapsamdaki yaş ve uzantı koşullarına uyan dosya yok; bilgisayarda hiç geçici dosya olmadığı anlamına gelmez.':'Tarama kısmen tamamlandı; okunamayan dosya veya klasörler var. 0 MB, bütün dosyaların kontrol edildiği anlamına gelmez.';
      const diagnostic=document.getElementById('cleanup-disk-result');
      diagnostic.textContent=(preview.diagnostics||[]).map(d=>`${d.path}: ${d.examined} dosya ve ${d.directories} alt klasör incelendi, ${d.recent} yeni, ${d.otherTypes} farklı uzantı ve ${d.links||0} bağlantı atlandı; ${d.errors} okuma hatası${d.error?' ('+d.error+')':''}.`).join('\n') || `${drive||'Seçili kapsam'} üzerinde uygun geçici klasör yok. Geçici dosyalar ${preview.availableDrives?.join(', ')||'sistem diski'} üzerinde bulunur.`;
    }catch(err){summary.textContent='Tarama yapılamadı: '+err.message;}
    return new Promise(resolve=>{
      close.onclick=()=>{modal.classList.remove('active');resolve({success:false,canceled:true,message:'Temizlik iptal edildi; dosya silinmedi.'});};
      start.onclick=async()=>{
        start.disabled=true;close.disabled=true;
        summary.textContent='Yalnızca önizlemedeki değişmemiş dosyalar kontrol ediliyor…';
        try {
          const result=await api.cleanJunkFiles(preview.token);
          if(!result.success){summary.textContent=result.error||result.message||'İptal edildi.';start.disabled=false;return;}
          const outcomes=new Map(result.details.map(item=>[item.path,item]));
          [...list.children].forEach((row,index)=>{const outcome=outcomes.get(preview.files[index].path);row.classList.add(outcome?.outcome==='deleted'?'was-deleted':'was-skipped');row.querySelector('strong').textContent=(outcome?.outcome==='deleted'?'Silindi · ':'Atlandı · ')+preview.files[index].name;});
          summary.textContent=result.message;
          const disk=document.getElementById('cleanup-disk-result');
          disk.textContent=result.diskFreeDeltaBytes===null?'Disk boş alan ölçümü alınamadı.':`Diskte ölçülen boş alan değişimi: ${result.diskFreeDeltaBytes>=0?'+':'−'}${format(Math.abs(result.diskFreeDeltaBytes))}. Diğer uygulamaların eşzamanlı yazmaları bu değeri etkileyebilir.`;
          start.textContent='İşlem tamamlandı';close.textContent='Tamam';close.disabled=false;
          close.onclick=()=>{modal.classList.remove('active');resolve(result);};
        }catch(err){summary.textContent='Dosyalar silinemedi: '+err.message;start.disabled=false;}
        finally{close.disabled=false;}
      };
    });
  };
})();
