document.addEventListener('DOMContentLoaded', async()=>{
  const api=window.voldenaAPI;
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const settings=await api.getSettings();
  let startupContext={canConfigureStartup:true};
  const themes=[
    ['night','Gece','#090e18','#0d1421','#080e18','#43d9ef'],
    ['ocean','Okyanus','#071a29','#0b2538','#061522','#38bdf8'],
    ['forest','Orman','#0d1b16','#14291f','#0a1510','#4ade80'],
    ['violet','Mor','#191226','#251a36','#140e20','#c084fc'],
    ['sunset','Günbatımı','#25131a','#351b24','#1c0e14','#fb923c'],
    ['graphite','Grafit','#151719','#1e2226','#101214','#a5b4fc'],
    ['light','Açık','#f1f5f9','#ffffff','#e2e8f0','#0369a1'],
    ['sand','Günışığı','#f6f2e9','#fffaf0','#ebe4d6','#9a5800'],
    ['ice','Buz','#ecf7fa','#f7fdff','#d9edf3','#0e7490'],
    ['rose','Gül','#fff1f2','#fffafa','#fce1e5','#be185d']
  ];
  const validColor=value=>/^#[a-f\d]{6}$/i.test(value);
  function applyTheme(id,colors){
    const preset=themes.find(theme=>theme[0]===id)||themes[0];
    const palette=id==='custom'&&Array.isArray(colors)&&colors.length===4&&colors.every(validColor)?colors:preset.slice(2);
    const [background,sidebar,header,accent]=palette;
    const isLight=color=>{const [r,g,b]=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));return r*.2126+g*.7152+b*.0722>150;};
    const rgb=[1,3,5].map(i=>parseInt(background.slice(i,i+2),16));
    const light=(rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722)>150;
    const values={'--theme-bg':background,'--theme-sidebar':sidebar,'--theme-header':header,'--sidebar-text':isLight(sidebar)?'#162334':'#f1f5f9','--sidebar-muted':isLight(sidebar)?'#475569':'#a4b4c8','--header-text':isLight(header)?'#162334':'#f1f5f9','--primary':accent,'--primary-gradient':`linear-gradient(120deg,${accent},${accent})`,'--theme-card':light?'#ffffff':id==='custom'?background:sidebar,'--theme-input':light?'#f1f5f9':background,'--text-main':light?'#162334':'#f1f5f9','--text-muted':light?'#475569':'#a4b4c8','--text-dim':light?'#596b80':'#8194ac','--border-subtle':light?'#cbd5e1':'#2a3a4c'};
    for(const [name,value] of Object.entries(values))document.documentElement.style.setProperty(name,value);
    const accentRGB=[1,3,5].map(i=>parseInt(accent.slice(i,i+2),16));
    document.documentElement.style.setProperty('--on-primary',accentRGB[0]*.2126+accentRGB[1]*.7152+accentRGB[2]*.0722>150?'#092033':'#ffffff');
    document.body.dataset.theme=id;document.body.dataset.themeLight=String(light);
  }
  applyTheme(settings.themeId||'night',settings.themeColors);

  const themeCard=document.createElement('div');themeCard.className='glass-card theme-settings';
  themeCard.innerHTML='<h3 class="card-heading">Görünüm ve renkler</h3><p class="section-desc">Tema anında uygulanır. İstediğiniz zaman Gece temasına dönebilirsiniz.</p><div class="theme-grid"></div><details><summary>Kendi renklerini seç</summary><div class="custom-colors"></div></details><button type="button" class="btn btn-secondary" id="restart-tour">Tanıtımı yeniden göster</button>';
  const settingsTab=document.getElementById('tab-settings');settingsTab.appendChild(themeCard);
  for(const theme of themes){const button=document.createElement('button');button.type='button';button.className='theme-choice';button.textContent=theme[1];button.style.borderLeft=`6px solid ${theme[5]}`;button.setAttribute('aria-pressed',String((settings.themeId||'night')===theme[0]));button.onclick=async()=>{applyTheme(theme[0]);await api.updateSettings({themeId:theme[0]});themeCard.querySelectorAll('.theme-choice').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));};themeCard.querySelector('.theme-grid').appendChild(button);}
  const chosenColors=(settings.themeColors||themes.find(theme=>theme[0]===settings.themeId)?.slice(2)||themes[0].slice(2));
  ['Ana arka plan','Sol menü','Üst çubuk','Vurgu / düğmeler'].forEach((label,index)=>{const row=document.createElement('label');row.textContent=label;const input=document.createElement('input');input.type='color';input.value=validColor(chosenColors[index])?chosenColors[index]:themes[0][index+2];input.onchange=async()=>{const colors=[...themeCard.querySelectorAll('input[type=color]')].map(item=>item.value);applyTheme('custom',colors);await api.updateSettings({themeId:'custom',themeColors:colors});themeCard.querySelectorAll('.theme-choice').forEach(button=>button.setAttribute('aria-pressed','false'));};row.appendChild(input);themeCard.querySelector('.custom-colors').appendChild(row);});

  const history=document.createElement('div');history.className='glass-card session-history';history.id='last-session-report';
  history.innerHTML='<h3 class="card-heading">Son İşlem Raporu</h3><p class="section-desc">Kapatılan bir uygulamayı buradan korumaya alın; sonraki işlemlerde kapanmasın.</p><div id="last-session-rows"></div>';
  const logs=document.createElement('details');logs.className='operation-logs';logs.id='operation-logs';const summary=document.createElement('summary');summary.textContent='İşlem Günlükleri';logs.appendChild(summary);logs.appendChild(history);settingsTab.appendChild(logs);
  async function renderHistory(report){
    if(!report)report=await api.getLastSession();
    const list=document.getElementById('last-session-rows');list.replaceChildren();
    if(!report){list.textContent='Henüz tamamlanmış işlem yok. İşlem yapıldığında gerçek sonuçlar burada görünecek.';return;}
    const header=document.createElement('p');header.className='history-heading';header.textContent=`${report.ruleName||'Optimizasyon'} · ${new Date(report.at).toLocaleString('tr-TR')}`;list.appendChild(header);
    const totals=document.createElement('div');totals.className='history-totals';for(const [label,count] of [['Kapandı',(report.closedApps||[]).length],['Durduruldu',(report.details||[]).filter(item=>item.outcome==='paused').length],['Açıldı',(report.launches||[]).filter(item=>item.launched).length],['Atlandı / açık değil',(report.details||[]).filter(item=>['skipped','not-running-or-inaccessible'].includes(item.outcome)).length]]){const chip=document.createElement('span');const value=document.createElement('strong');value.textContent=count;chip.append(value,document.createTextNode(label));totals.appendChild(chip);}list.appendChild(totals);
    const protectedApps=(await api.getProtectedApps()).map(name=>name.toLowerCase());
    const outcomes={closed:'Kapandı',paused:'Durduruldu (resmî Wallpaper Engine komutu)',partial:'Kısmen kapandı',failed:'Kapatılamadı',skipped:'Atlandı','not-running-or-inaccessible':'Çalışmıyor / erişilemiyor'};
    for(const detail of report.details||[]){const row=document.createElement('div');row.className='history-row outcome-'+detail.outcome;row.dataset.appExe=detail.name||'';const text=document.createElement('span');text.className='history-app-copy';const name=document.createElement('strong');name.textContent=detail.name||'Uygulama';const status=document.createElement('small');status.textContent=`${outcomes[detail.outcome]||detail.outcome}${detail.reason?' · '+({protected:'Beyaz listede / oyun korunuyor',unsupported:'Windows, sürücü, hizmet veya desteklenmeyen uygulama'}[detail.reason]||detail.reason):''}`;text.append(name,status);row.appendChild(text);if(detail.name&&/^[\w .-]+\.exe$/i.test(detail.name)){const button=document.createElement('button');button.type='button';button.className='btn btn-secondary';button.textContent=protectedApps.includes(detail.name.toLowerCase())?'Korunuyor':'Bunu bir daha kapatma';button.disabled=protectedApps.includes(detail.name.toLowerCase());button.onclick=async()=>{const current=await api.getProtectedApps();if(!current.some(name=>name.toLowerCase()===detail.name.toLowerCase()))await api.updateProtectedApps([...current,detail.name]);button.textContent='Korunuyor';button.disabled=true;window.dispatchEvent(new Event('protected-apps-changed'));};row.appendChild(button);}list.appendChild(row);}
    for(const launch of report.launches||[]){const row=document.createElement('p');row.textContent=`${launch.target}: ${launch.launched?'Başlatıldı':'Yeni örnek açılmadı'}`;list.appendChild(row);}
    if(report.desktop){const row=document.createElement('p');row.textContent=report.desktop==='kept-open'?'Explorer korundu: '+report.desktopError:'Explorer geçici kapatma istendi; ayrı kurtarma görevi izliyor.';list.appendChild(row);}
    if(report.exitRestore){const row=document.createElement('p');row.textContent=report.exitRestore.armed?'Seçili geri açma izleyicisi hazır; Voldena kapansa da oyun bitişi bekleniyor.':'Geri açma izleyicisi başlatılamadı: '+report.exitRestore.error;list.appendChild(row);}
  }
  void renderHistory();api.onStatusChange(state=>{if(state.report)void renderHistory(state.report);});

  const bulkButton=document.getElementById('btn-configure-bulk');
  bulkButton.onclick=async()=>{
    const modal=document.createElement('div');modal.className='modal-overlay active';
    modal.innerHTML='<div class="modal-box bulk-modal" role="dialog" aria-modal="true" aria-label="Toplu kapatma listesi"><div class="modal-header"><h2 class="modal-title">Toplu kapatma listesi</h2><button type="button" class="modal-close-btn">×</button></div><p>Yalnızca işaretlenen desteklenen kullanıcı uygulamaları kapatılır. Korumalı uygulamalar, oyunlar ve Windows bileşenleri kapsam dışıdır. Düşük seviye hiçbir uygulamayı kapatmaz.</p><div class="bulk-list">Liste yükleniyor…</div><div class="modal-actions"><button class="btn btn-secondary" data-cancel>Vazgeç</button><button class="btn btn-primary" data-save>Listeyi kaydet</button></div></div>';
    document.body.appendChild(modal);modal.querySelector('[data-save]').disabled=true;
    const close=()=>modal.remove();modal.querySelector('.modal-close-btn').onclick=close;modal.querySelector('[data-cancel]').onclick=close;
    try{
      const [candidates,current]=await Promise.all([api.getBulkCandidates(),api.getSettings()]);
      const selected=new Set((current.defaultCloseTargets||[]).map(name=>name.toLowerCase()));const list=modal.querySelector('.bulk-list');list.replaceChildren();
      for(const candidate of candidates){const row=document.createElement('label');row.className='bulk-row';const input=document.createElement('input');input.type='checkbox';input.value=candidate.name;input.checked=selected.has(candidate.name);input.disabled=candidate.protected;row.appendChild(input);row.appendChild(document.createTextNode(`${candidate.name} · ${candidate.protected?'Korumalı':candidate.running?'Şu anda açık':'Şu anda kapalı'}`));list.appendChild(row);}
      modal.querySelector('[data-save]').disabled=false;
      modal.querySelector('[data-save]').onclick=async()=>{const targets=[...modal.querySelectorAll('.bulk-list input:checked:not(:disabled)')].map(input=>input.value);await api.updateSettings({defaultCloseTargets:targets});close();};
    }catch(error){modal.querySelector('.bulk-list').textContent='Liste alınamadı: '+error.message;}
  };

  const steps=[
    ['dashboard','.cards-grid','Sistem paneli','CPU, RAM ve GPU tüm bilgisayarın yükünü gösterir. Açık oyunu hemen işlemek için Aktif Oyunu Algıla ve Hızlandır düğmesini kullanın.'],
    ['game-optimization','#game-optimization-rules','Oyun ve uygulama profilleri','Bir oyun veya Antigravity gibi uygulama açılınca kapatılacakları ve başlatılacak yardımcıları ayrı ayrı seçin. Düşük seviye yalnızca yardımcıları açar.'],
    ['auto-game-engine','#discovered-games-container','Otomatik oyun algılama','Algılanan oyuna tıklayarak kapatılacak uygulamaları özelleştirebilirsiniz. Kaydedince özel profillere eklenir.'],
    ['protected','#protected-apps-list','Korumalı uygulamalar','Bu listedekiler toplu kapatmada da korunur. Ayarlar → İşlem Günlükleri üzerindeki Bunu bir daha kapatma düğmesi de buraya ekler.'],
    ['disk','#btn-scan-large-files','Disk temizliği','Diski Tara ile büyük dosyaları listeleyin. Sekme değiştirirken sonuçlar korunur. Geçici dosyaları silmeden önce adlarını ve neden aday olduklarını inceleyin.'],
    ['settings','.settings-grid','Tercihlerinizi seçin','Windows başlangıcında açılış her zaman gizlidir. Geri açma seçerseniz Voldena oyunun bitişini beklemek için arka planda kalır.']
  ];
  let tour=null,index=0,prefs=null;
  async function finishTour(savePrefs){
    if(!startupContext.canConfigureStartup)delete prefs.autoStartOnBoot;
    if(savePrefs){const updated=await api.updateSettings({...prefs,onboardingComplete:true});for(const [id,key] of [['setting-autostart','autoStartOnBoot'],['setting-auto-exit','exitAfterOptimization'],['setting-auto-restore','autoRestoreOnExit'],['setting-auto-game-detection','autoGameDetection'],['setting-auto-game-detection-settings','autoGameDetection']]){const input=document.getElementById(id);if(input)input.checked=!!updated[key];}}
    else await api.updateSettings({onboardingComplete:true});
    tour?.remove();tour=null;document.querySelectorAll('.tour-target').forEach(item=>item.classList.remove('tour-target'));
  }
  function showStep(){
    const [tab,selector,title,text]=steps[index];document.querySelector(`.nav-item[data-tab="${tab}"]`)?.click();
    document.querySelectorAll('.tour-target').forEach(item=>item.classList.remove('tour-target'));
    const target=document.querySelector(selector);target?.classList.add('tour-target');target?.scrollIntoView({block:'center',behavior:'instant'});
    tour.innerHTML=`<div class="tour-heading"><small>${index+1} / ${steps.length}</small><button type="button" data-skip aria-label="Tanıtımı kapat">×</button></div><h2>${title}</h2><p>${text}</p><div class="tour-preferences"></div><div class="tour-actions"><button type="button" class="btn btn-secondary" data-back>Geri</button><button type="button" class="btn btn-primary" data-next>${index===steps.length-1?'Tercihleri kaydet ve bitir':'Sonraki'}</button></div>`;
    tour.querySelector('[data-skip]').onclick=()=>void finishTour(false);tour.querySelector('[data-back]').disabled=index===0;tour.querySelector('[data-back]').onclick=()=>{index--;showStep();};tour.querySelector('[data-next]').onclick=()=>{if(index===steps.length-1)void finishTour(true);else{index++;showStep();}};
    if(index===steps.length-1)for(const [key,label] of [['autoStartOnBoot','Bilgisayar açılışında gizli başlat'],['autoGameDetection','Oyunları otomatik algıla'],['autoRestoreOnExit','Oyun bitince kapatılan uygulamaları geri aç']]){const row=document.createElement('label');const input=document.createElement('input');input.type='checkbox';input.checked=!!prefs[key];input.disabled=key==='autoStartOnBoot'&&!startupContext.canConfigureStartup;input.onchange=()=>prefs[key]=input.checked;row.appendChild(input);row.appendChild(document.createTextNode(label+(input.disabled?' (Setup sürümünde)':'')));tour.querySelector('.tour-preferences').appendChild(row);}
  }
  async function startTour(){if(tour)return;const current=await api.getSettings();prefs={autoStartOnBoot:!!current.autoStartOnBoot,autoGameDetection:current.autoGameDetection!==false,autoRestoreOnExit:!!current.autoRestoreOnExit};index=0;tour=document.createElement('aside');tour.className='guided-tour';tour.setAttribute('role','dialog');tour.setAttribute('aria-label','Voldena tanıtımı');document.body.appendChild(tour);showStep();}
  document.getElementById('restart-tour').onclick=()=>void startTour();
  const resourceSettings=document.createElement('div');resourceSettings.className='glass-card resource-settings';
  resourceSettings.innerHTML='<h3 class="card-heading">Yüksek kaynak kullanımı önerileri</h3><p class="section-desc">Kapatma listenizde olmayan desteklenen kullanıcı uygulamaları için öneri gösterilir. Oyunlar, Windows, sürücüler ve korumalı uygulamalar önerilmez. Odağı çalan pencere açılmaz.</p><label><input type="checkbox" id="resource-enabled"> Önerileri göster</label><label>Toplam CPU eşiği (%) <input type="number" min="1" max="100" id="resource-cpu"></label><label>Toplam RAM eşiği (%) <input type="number" min="1" max="100" id="resource-ram"></label>';
  settingsTab.appendChild(resourceSettings);
  for(const [id,key,fallback] of [['resource-enabled','resourceWarnings',true],['resource-cpu','resourceCpuThreshold',15],['resource-ram','resourceRamThreshold',10]]){const input=document.getElementById(id);if(input.type==='checkbox')input.checked=settings[key]!==false;else input.value=settings[key]||fallback;input.onchange=async()=>{if(input.type!=='checkbox'&&(!input.checkValidity()))return;await api.updateSettings({[key]:input.type==='checkbox'?input.checked:Number(input.value)});};}
  const resourcePanel=document.createElement('div');resourcePanel.className='glass-card resource-advice';resourcePanel.hidden=true;document.getElementById('tab-dashboard').appendChild(resourcePanel);
  let adviceBusy=false;
  async function refreshAdvice(){
    if(document.hidden||adviceBusy)return;adviceBusy=true;
    try{const candidates=await api.getResourceAdvice();resourcePanel.replaceChildren();resourcePanel.hidden=!candidates.length;
      if(candidates.length){const title=document.createElement('h3');title.className='card-heading';title.textContent='Listede olmayan yüksek kullanım';resourcePanel.appendChild(title);}
      for(const candidate of candidates){const row=document.createElement('div');row.className='history-row resource-advice-row';row.dataset.appExe=candidate.paths?.[0]||candidate.name;const text=document.createElement('span');text.textContent=`${candidate.name} listenizde yok ve bilgisayarı meşgul ediyor: CPU %${candidate.cpuPercent}, RAM ${Math.round(candidate.memoryMb)} MB (%${candidate.ramPercent}). Açık kalmasına ihtiyacınız var mı?`;row.appendChild(text);
        for(const [label,action] of [['Evet, kapat',async()=>{const result=await api.closeResourceAdvice(candidate.name);text.textContent=result.message;}],['Hayır',async()=>{await api.dismissResourceAdvice(candidate.name);row.remove();}]]){const button=document.createElement('button');button.type='button';button.className='btn btn-secondary';button.textContent=label;button.onclick=async()=>{button.disabled=true;try{await action();}finally{button.disabled=false;}};row.appendChild(button);}resourcePanel.appendChild(row);}
    }catch{}finally{adviceBusy=false;}
  }
  setInterval(()=>void refreshAdvice(),20000);void refreshAdvice();
  const context=await api.getStartupContext();
  startupContext=context;
  if(!context.canConfigureStartup){const input=document.getElementById('setting-autostart');if(input){input.disabled=true;input.title='Windows başlangıcı için Setup sürümü gerekir.';}}
  if(!settings.onboardingComplete&&!context.hiddenLaunch&&!context.testMode){for(let n=0;n<200&&document.body.dataset.ready!=='true';n++)await new Promise(resolve=>setTimeout(resolve,100));void startTour();}
  api.onManualOpen(async()=>{if(!(await api.getSettings()).onboardingComplete)void startTour();});
  document.body.dataset.experienceReady='true';
});
