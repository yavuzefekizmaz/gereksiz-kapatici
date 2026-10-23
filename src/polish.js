document.addEventListener('DOMContentLoaded',async()=>{
  const api=window.voldenaAPI,el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
  const report=(name,details={})=>void api.reportUiEvent({name,...details}).catch(()=>{});
  window.addEventListener('error',event=>report('error',{message:event.message}));
  window.addEventListener('unhandledrejection',event=>report('unhandled-rejection',{message:event.reason?.message||String(event.reason)}));
  document.querySelectorAll('.nav-item[data-tab]').forEach(button=>button.addEventListener('click',()=>report('page-opened',{tab:button.dataset.tab})));
  for(let n=0;n<300&&document.body.dataset.experienceReady!=='true';n++)await new Promise(resolve=>setTimeout(resolve,100));

  // A single in-app notice updates its own text, without opening a new popup.
  const countdown=el('aside','exit-countdown');countdown.id='exit-countdown';countdown.hidden=true;
  countdown.innerHTML='<i class="fa-solid fa-hourglass-half"></i><div><strong role="status" aria-live="polite"></strong><small>İşlemler tamamlandı. Oyun açık kalacak.</small></div><button type="button" class="btn-link" data-stay>Açık kalsın</button><button type="button" class="notice-close" aria-label="Bildirimi gizle">×</button>';
  document.body.appendChild(countdown);let deadline=null,dismissed=null;
  function renderCountdown(){const visible=deadline&&deadline!==dismissed;countdown.hidden=!visible;if(!visible)return;const minutes=Math.max(1,Math.ceil((deadline-Date.now())/60000));const text=`Voldena ${minutes} dk sonra kapanacak`;const label=countdown.querySelector('strong');if(label.textContent!==text)label.textContent=text;}
  api.onStatusChange(state=>{deadline=state.exitDeadline;renderCountdown();});
  const status=await api.getStatus();deadline=status.exitDeadline;renderCountdown();setInterval(renderCountdown,1000);
  countdown.querySelector('.notice-close').onclick=()=>{dismissed=deadline;renderCountdown();};
  countdown.querySelector('[data-stay]').onclick=async()=>{await api.updateSettings({exitAfterOptimization:false});deadline=null;renderCountdown();document.getElementById('setting-auto-exit').checked=false;report('automatic-exit-canceled');};

  // Shared local EXE artwork. Windows components keep their gear fallback.
  const iconCache=new Map(),pending=new Set();let iconTimer=null;
  function decorate(root){
    const nodes=[...(root.matches?.('[data-app-exe]')?[root]:[]),...(root.querySelectorAll?.('[data-app-exe]')||[])];
    for(const node of nodes){if(node.dataset.iconRequested)continue;node.dataset.iconRequested='true';
      const fallback=node.matches('.protected-tag')?'fa-shield-halved':'fa-gear';
      let host=node.querySelector('.app-avatar,.picker-item-icon,.discovered-game-icon,.manual-boost-icon');
      if(!host){host=el('span','app-avatar');const old=node.querySelector(':scope > i');if(old)old.replaceWith(host);else node.prepend(host);}
      host.replaceChildren();const glyph=el('i','fa-solid '+fallback);host.appendChild(glyph);
      if(node.dataset.system==='true')continue;
      node._iconHost=host;pending.add(node);
    }
    if(pending.size&&!iconTimer)iconTimer=setTimeout(flushIcons,100);
  }
  async function flushIcons(){iconTimer=null;const nodes=[...pending].filter(node=>node.isConnected);pending.clear();
    const targets=[...new Set(nodes.map(node=>node.dataset.appExe).filter(Boolean))];
    try{for(let start=0;start<targets.length;start+=80){const missing=targets.slice(start,start+80).filter(target=>!iconCache.has(target));if(missing.length){const icons=await api.getAppIcons(missing);for(const [target,icon] of Object.entries(icons))if(icon)iconCache.set(target,icon);}}
      for(const node of nodes){const icon=iconCache.get(node.dataset.appExe);if(!icon||!/^data:image\/(png|x-icon);base64,/i.test(icon)||!node.isConnected)continue;const image=el('img','native-app-icon');image.src=icon;image.alt='';node._iconHost.replaceChildren(image);}
    }catch{}
  }
  window.voldenaIcons={decorate};decorate(document.body);
  new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1)decorate(node);}).observe(document.body,{subtree:true,childList:true});

  // Start with the user's list; expanding reveals the full process inventory.
  async function openSelection(mode='bulk'){
    const current=await api.getSettings(),key=mode==='idle'?'quickIdleCloseTargets':'defaultCloseTargets';
    const selected=new Set((current[key]||(mode==='idle'?['anydesk.exe']:[])).map(name=>name.toLowerCase()));
    const modal=el('div','modal-overlay active');modal.innerHTML='<div class="modal-box bulk-modal" role="dialog" aria-modal="true"><div class="modal-header"><h2 class="modal-title"></h2><button class="modal-close-btn" type="button">×</button></div><p class="selection-help"></p><input class="form-input" type="search" placeholder="Uygulama veya süreç ara…" aria-label="Kapatma listesinde ara"><div class="bulk-list"></div><button class="btn btn-secondary show-more-processes" type="button">Daha fazla göster · tüm işlemler</button><div class="modal-actions"><button type="button" class="btn btn-secondary" data-cancel>Vazgeç</button><button type="button" class="btn btn-primary" data-save>Seçimi kaydet</button></div></div>';
    modal.querySelector('h2').textContent=mode==='idle'?'Oyun yokken hafif hızlandırma':'Oyunlarda ortak kapatma listesi';
    modal.querySelector('.selection-help').textContent=mode==='idle'?'Masaüstü kısayoluna bastığınızda açık oyun yoksa yalnızca bu seçtikleriniz kapatılır. Örneğin AnyDesk. Oyun profillerinin uzun listesi kullanılmaz.':'Önce daha önce listelerinize ekledikleriniz gösterilir. Yalnızca seçtiğiniz desteklenen uygulamalar işlenir; korumalı uygulamalar ve Windows bileşenleri kapanmaz.';
    document.body.appendChild(modal);const list=modal.querySelector('.bulk-list'),search=modal.querySelector('input[type=search]'),save=modal.querySelector('[data-save]');let candidates=[];save.disabled=true;
    const close=()=>modal.remove();modal.querySelector('.modal-close-btn').onclick=close;modal.querySelector('[data-cancel]').onclick=close;
    function render(){list.replaceChildren();const filtered=candidates.filter(item=>item.name.toLowerCase().includes(search.value.toLowerCase()));
      if(!filtered.length)list.appendChild(el('p','empty-state','Bu görünümde uygulama yok. Daha fazla göster ile çalışan süreçlere bakabilirsiniz.'));
      for(const candidate of filtered){const row=el('label','bulk-row');row.dataset.appExe=candidate.path||candidate.name;row.dataset.system=String(!!candidate.system);
        const input=el('input');input.type='checkbox';input.checked=selected.has(candidate.name);input.disabled=candidate.protected||candidate.supported===false;
        const copy=el('span','bulk-app-copy');copy.append(el('strong','',candidate.name),el('small','',candidate.protected?'Korumalı · açık kalır':candidate.supported===false?'Windows / hizmet / destek dışı · kapatılmaz':candidate.running?`Açık · ${Math.round(candidate.memoryMb||0)} MB RAM`:'Şu anda kapalı'));
        row.append(input,copy);input.onchange=()=>{if(input.checked)selected.add(candidate.name);else selected.delete(candidate.name);};list.appendChild(row);}
    }
    search.oninput=render;
    async function load(all){save.disabled=true;list.textContent='Uygulamalar yükleniyor…';try{candidates=await api.getBulkCandidates(all);render();save.disabled=false;}catch(error){list.textContent='Liste alınamadı: '+error.message;}}
    modal.querySelector('.show-more-processes').onclick=async event=>{event.target.disabled=true;await load(true);event.target.textContent='Tüm işlemler gösteriliyor';};
    save.onclick=async()=>{save.disabled=true;try{await api.updateSettings({[key]:[...selected]});report('close-selection-saved',{message:mode+': '+selected.size+' uygulama'});close();}catch(error){save.disabled=false;list.prepend(el('p','',error.message));}};
    await load(false);
  }
  document.getElementById('btn-configure-bulk').onclick=()=>void openSelection();
  const idle=el('div','glass-card idle-boost-settings');idle.innerHTML='<div class="feature-card-heading"><span class="feature-symbol"><i class="fa-solid fa-bolt"></i></span><div><h3>Oyun yokken hafif hızlandırma</h3><p>Masaüstündeki Hızlandır ve Kapat kısayolu, açık oyun bulamazsa bu küçük listeyi kullanır.</p></div></div><div class="idle-boost-actions"><label class="check-option"><input id="idle-boost-enabled" type="checkbox"> Oyun yokken de seçtiklerimi kapat</label><button class="btn btn-secondary" type="button" id="configure-idle-boost">Uygulamaları seç</button></div><p class="setting-desc">Başlangıç önerisi AnyDesk. Korumalı listedekiler kapanmaz. Kazanım, kapanan uygulamaların gerçek CPU/RAM yüküne bağlıdır.</p>';
  document.getElementById('tab-settings').appendChild(idle);const preferences=await api.getSettings();document.getElementById('idle-boost-enabled').checked=preferences.quickIdleEnabled!==false;
  document.getElementById('idle-boost-enabled').onchange=event=>void api.updateSettings({quickIdleEnabled:event.target.checked});
  document.getElementById('configure-idle-boost').onclick=()=>void openSelection('idle');

  // Profile setup: choose the trigger, actions during play, then selected exit apps.
  const box=document.querySelector('#modal-rule .modal-box'),actions=box.querySelector('.modal-actions');
  const navigation=el('nav','profile-step-tabs');navigation.setAttribute('aria-label','Profil adımları');
  const sections=[el('section','profile-step'),el('section','profile-step'),el('section','profile-step'),el('section','profile-step')];
  const descriptions=['Önce oyunu veya uygulamayı seçin. Dosyayı değiştirmek isterseniz buradan düzenleyebilirsiniz.','Bu oyun açıldığında ne kapansın, ne açılsın? İstemediğiniz listeleri boş bırakabilirsiniz.','Oyun kapandığında yalnızca bu liste açılır. Tüm kapatılanları geri açmanız gerekmez.','Bu seçenekler isteğe bağlıdır. Varsayılanlarda Windows masaüstü ve görev çubuğu korunur.'];
  for(let i=0;i<sections.length;i++)sections[i].appendChild(el('p','profile-step-help',descriptions[i]));
  for(const [id,index] of [['rule-form-name',0],['rule-form-trigger',0],['input-manual-close',1],['input-manual-launch',1],['rule-form-exit-launch',2],['rule-form-level',3],['rule-form-keep-explorer',3]]){const group=document.getElementById(id).closest('.form-group');sections[index].appendChild(group);}
  box.insertBefore(navigation,actions);for(const section of sections)box.insertBefore(section,actions);
  let step=0;const titles=['1 · Oyun / uygulama','2 · Oyun sırasında','3 · Oyun bitince','Gelişmiş'];
  function choose(index){step=index;sections.forEach((section,i)=>section.hidden=i!==step);navigation.querySelectorAll('button').forEach((button,i)=>button.setAttribute('aria-current',String(i===step)));previous.disabled=step===0;next.textContent=step<2?'Sonraki adım':'Gelişmiş seçenekler';next.hidden=step===3;box.scrollTop=0;}
  titles.forEach((title,index)=>{const button=el('button','',title);button.type='button';button.onclick=()=>choose(index);navigation.appendChild(button);});
  const previous=el('button','btn btn-secondary','Geri'),next=el('button','btn btn-secondary','Sonraki adım');previous.type=next.type='button';actions.insertBefore(previous,document.getElementById('btn-save-rule'));actions.insertBefore(next,document.getElementById('btn-save-rule'));previous.onclick=()=>choose(Math.max(0,step-1));next.onclick=()=>choose(Math.min(3,step+1));
  window.addEventListener('profile-modal-opened',()=>choose(0));choose(0);

  // More useful protection chips, using the same one-click protection behavior.
  const suggestions=document.querySelector('.quick-add-protected')?.parentElement;
  if(suggestions){suggestions.classList.add('protection-suggestions');suggestions.replaceChildren(el('span','suggestion-heading','Hızlı korumaya al'));
    const options=[['VS Code','code.exe'],['AnyDesk','anydesk.exe'],['OneDrive','onedrive.exe'],['OBS Studio','obs64.exe'],['Discord','Discord.exe'],['Spotify','Spotify.exe'],['Chrome','chrome.exe'],['Opera','opera.exe'],['Steam','steam.exe'],['Riot Client','RiotClientServices.exe'],['Epic Games','EpicGamesLauncher.exe'],['Antigravity','antigravity.exe'],['ChatGPT','ChatGPT.exe'],['Telegram','Telegram.exe'],['WhatsApp','WhatsApp.exe'],['Wallpaper Engine','wallpaper64.exe'],['Clownfish','ClownfishVoiceChanger.exe'],['PowerToys','PowerToys.exe'],['Everything','Everything.exe'],['Valorant Tracker','Valorant Tracker.exe']];
    for(const [name,exe] of options){const button=el('button','protection-chip',name);button.type='button';button.dataset.appExe=exe;button.onclick=async()=>{const current=await api.getProtectedApps();if(!current.some(item=>item.toLowerCase()===exe.toLowerCase()))await api.updateProtectedApps([...current,exe]);button.classList.add('is-protected');button.title='Korumalı listeye eklendi';window.dispatchEvent(new Event('protected-apps-changed'));};suggestions.appendChild(button);}
  }

  // Friendly color controls keep the original theme persistence handlers.
  const theme=document.querySelector('.theme-settings');
  theme.querySelector('.custom-colors').classList.add('color-editor-grid');
  theme.querySelectorAll('.custom-colors label').forEach((label,index)=>{
    const input=label.querySelector('input[type=color]'),name=label.firstChild.textContent;
    label.className='custom-color-card';label.replaceChildren();
    const swatch=el('span','color-swatch'),copy=el('span','color-copy');swatch.style.background=input.value;swatch.appendChild(input);
    const hex=el('input','color-hex');hex.type='text';hex.value=input.value.toUpperCase();hex.maxLength=7;hex.setAttribute('aria-label',name+' renk kodu');
    copy.append(el('strong','',name),hex);label.append(swatch,copy);
    input.addEventListener('input',()=>{swatch.style.background=input.value;hex.value=input.value.toUpperCase();});
    input.addEventListener('change',()=>{swatch.style.background=input.value;hex.value=input.value.toUpperCase();});
    hex.onchange=()=>{if(/^#[a-f\d]{6}$/i.test(hex.value)){input.value=hex.value;input.dispatchEvent(new Event('change'));}else hex.value=input.value.toUpperCase();};
  });
  const colorHelp=el('p','setting-desc','Renk kutusuna tıklayın veya # ile başlayan renk kodunu yazın. Ana arka plan, menü ve üst çubuk ayrı ayrı değişir.');theme.querySelector('details').insertBefore(colorHelp,theme.querySelector('.custom-colors'));
  theme.querySelectorAll('.theme-choice').forEach(button=>button.addEventListener('click',()=>setTimeout(()=>{const variables=['--theme-bg','--theme-sidebar','--theme-header','--primary'];theme.querySelectorAll('input[type=color]').forEach((input,index)=>{input.value=getComputedStyle(document.documentElement).getPropertyValue(variables[index]).trim();input.parentElement.style.background=input.value;input.closest('label').querySelector('.color-hex').value=input.value.toUpperCase();});},0)));

  const resources=document.querySelector('.resource-settings');
  resources.querySelector('h3').textContent='Fazla yük oluşturan uygulamaları fark et';
  resources.querySelector('p').textContent='Kapatma listenizde olmayan bir uygulama aşağıdaki sınırı aşarsa ana ekranda sorulur: “Kapatılsın mı?” Siz onaylamadan hiçbir şey kapatılmaz.';
  resources.querySelectorAll('label').forEach((label,index)=>{if(index===0){label.classList.add('check-option');return;}const input=label.querySelector('input');label.replaceChildren();label.className='threshold-setting';const copy=el('span','threshold-copy');copy.append(el('strong','',index===1?'İşlemci kullanımı (CPU)':'Bellek kullanımı (RAM)'),el('small','',index===1?'Bilgisayarın toplam işlemci gücünün bu kadarını kullanırsa öner.':'Bilgisayarın toplam belleğinin bu kadarını kullanırsa öner.'));const control=el('span','threshold-control');control.append(input,el('span','','%'));label.append(copy,control);});
  resources.appendChild(el('p','setting-desc','Örnek: CPU %15, bir uygulamanın toplam işlemci gücünün %15’ini kullanmasıdır. Oyunlar, Windows bileşenleri ve korumalı uygulamalar önerilmez.'));

  // Local support log: preview, copy, or export directly under the app's data folder.
  const diagnostics=el('div','glass-card diagnostics-card');diagnostics.id='detailed-diagnostics';diagnostics.innerHTML='<div class="feature-card-heading"><span class="feature-symbol"><i class="fa-solid fa-file-lines"></i></span><div><h3>Ayrıntılı tanılama günlüğü</h3><p>Algılama, kapatma nedenleri, açılan uygulamalar, taramalar ve hatalar zamanlarıyla kaydedilir.</p></div></div><p class="setting-desc">Sorun yaşarsanız günlüğü kopyalayıp paylaşabilirsiniz. Yerel uygulama adları ve dosya konumları içerebilir. Kayıt boyutu sınırlıdır; eski kayıtlar döndürülür.</p><div class="diagnostic-actions"><button type="button" class="btn btn-secondary" data-refresh><i class="fa-solid fa-rotate-right"></i> Günlüğü göster / yenile</button><button type="button" class="btn btn-secondary" data-copy><i class="fa-solid fa-copy"></i> Tek tuşla kopyala</button><button type="button" class="btn btn-primary" data-export><i class="fa-solid fa-download"></i> logs.txt kaydet</button></div><p class="diagnostic-feedback" role="status"></p><pre class="diagnostic-preview" hidden></pre>';
  document.getElementById('tab-settings').appendChild(diagnostics);const feedback=diagnostics.querySelector('.diagnostic-feedback'),preview=diagnostics.querySelector('pre');
  async function logAction(button,action){button.disabled=true;try{await action();}catch(error){feedback.textContent=error.message;}finally{button.disabled=false;}}
  diagnostics.querySelector('[data-refresh]').onclick=event=>logAction(event.currentTarget,async()=>{preview.textContent=await api.getDiagnostics();preview.hidden=false;});
  diagnostics.querySelector('[data-copy]').onclick=event=>logAction(event.currentTarget,async()=>{await api.copyDiagnostics();feedback.textContent='Ayrıntılı günlük panoya kopyalandı.';});
  diagnostics.querySelector('[data-export]').onclick=event=>logAction(event.currentTarget,async()=>{const result=await api.exportDiagnostics();feedback.replaceChildren(document.createTextNode('Kaydedildi: '+result.path+' '));const button=el('button','btn-link','Klasörde göster');button.onclick=()=>api.showItemInFolder(result.path);feedback.appendChild(button);});

  document.body.dataset.polishReady='true';
});
