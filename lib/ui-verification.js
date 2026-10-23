// Runs only with --voldena-safe-test --verify-ui, against isolated user data.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
module.exports=async function verifyUI(page,directory){
  const run=fn=>page.executeJavaScript(`(${fn.toString()})()`);
  const pause=()=>new Promise(resolve=>setTimeout(resolve,350));
  const capture=async name=>{await page.capturePage(undefined,{stayHidden:true,stayAwake:true});await pause();fs.writeFileSync(path.join(directory,name),(await page.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());};
  for(let n=0;n<100;n++){if(await run(()=>document.body.dataset.experienceReady==='true'))break;await pause();}
  assert.equal(await run(()=>!!document.querySelector('.theme-settings')),true,'Theme/tour initialization failed');
  for(let n=0;n<100;n++){if(await run(()=>document.body.dataset.polishReady==='true'))break;await pause();}
  assert.equal(await run(()=>document.body.dataset.polishReady),'true','New controls did not initialize');
  await run(()=>{const style=document.createElement('style');style.textContent='*,*::before,*::after{animation:none!important;transition:none!important}';document.head.appendChild(style);});
  await run(()=>window.voldenaAPI.updateSettings({autoRestoreOnExit:false,exitAfterOptimization:true}));
  await run(()=>document.querySelector('.nav-item[data-tab="settings"]').click());
  await run(()=>document.querySelectorAll('.theme-choice')[6].click());await pause();
  assert.equal(await run(()=>document.body.dataset.themeLight),'true');
  await capture('theme-light.png');
  await run(()=>document.querySelectorAll('.theme-choice')[0].click());await pause();
  await run(()=>document.getElementById('restart-tour').click());await pause();
  const tabs=[];
  for(let n=0;n<6;n++){
    tabs.push(await run(()=>document.querySelector('.nav-item.active').dataset.tab));
    if(n<5){await run(()=>document.querySelector('.guided-tour [data-next]').click());await pause();}
  }
  assert.deepEqual(tabs,['dashboard','game-optimization','auto-game-engine','protected','disk','settings']);
  await run(()=>{document.querySelectorAll('.tour-preferences input')[2].click();document.querySelector('.guided-tour [data-next]').click();});await pause();
  assert.equal(await run(()=>document.getElementById('setting-auto-restore').checked),true);
  assert.equal(await run(()=>document.getElementById('setting-auto-exit').checked),false);
  await run(()=>document.querySelector('.nav-item[data-tab="auto-game-engine"]').click());
  await pause();assert.equal(await run(()=>!!document.querySelector('.discovered-game-card .native-app-icon')),true,'Known EXE artwork did not load');
  await run(()=>document.querySelector('.discovered-game-card').click());await pause();
  assert.equal(await run(()=>document.getElementById('rule-form-trigger').value),'VoldenaFixtureGame.exe');
  assert.equal(await run(()=>document.querySelectorAll('#modal-rule .profile-step-tabs button').length),4);
  await capture('profile-step-1.png');
  await run(()=>document.querySelectorAll('.profile-step-tabs button')[2].click());await pause();
  assert.equal(await run(()=>document.getElementById('btn-open-picker-exit').getBoundingClientRect().width>0),true);
  await run(()=>document.getElementById('btn-open-picker-exit').click());await pause();
  assert.equal(await run(()=>document.getElementById('modal-app-picker').classList.contains('active')),true);
  await run(()=>document.getElementById('btn-cancel-app-picker').click());await pause();
  await capture('profile-step-3.png');
  await run(()=>document.getElementById('rule-form-exit-launch').value='VoldenaFixtureRestore.exe');
  await run(()=>document.getElementById('btn-save-rule').click());await pause();
  assert.equal(await run(async()=>(await window.voldenaAPI.getRules()).some(rule=>rule.exitLaunchTargets?.includes('VoldenaFixtureRestore.exe'))),true);
  assert.equal(await run(()=>document.querySelector('.nav-item.active').dataset.tab),'game-optimization');
  await run(()=>document.querySelector('.nav-item[data-tab="settings"]').click());
  await run(()=>document.getElementById('setting-keep-explorer').click());await pause();
  assert.equal(await run(()=>document.getElementById('modal-confirm').classList.contains('active')),true);
  await run(()=>document.getElementById('btn-confirm-cancel').click());await pause();
  assert.equal(await run(()=>document.getElementById('setting-keep-explorer').checked),true);
  await capture('settings.png');
  await run(()=>document.getElementById('btn-configure-bulk').click());await pause();
  assert.equal(await run(()=>!!document.querySelector('.show-more-processes')),true);
  await capture('bulk-selection.png');
  await run(()=>document.querySelector('.bulk-modal [data-cancel]').click());
  const exported=await run(()=>window.voldenaAPI.exportDiagnostics());
  assert.equal(exported.path,path.join(directory,'logs.txt'));assert.ok(fs.readFileSync(exported.path,'utf8').includes('application-start'));
  await run(()=>{document.querySelector('.theme-settings details').open=true;document.querySelector('.theme-settings').scrollIntoView({block:'start'});});await pause();await capture('theme-editor.png');
  await run(()=>document.querySelector('.resource-settings').scrollIntoView({block:'start'}));await pause();await capture('resource-settings.png');
  await run(()=>document.querySelector('.nav-item[data-tab="protected"]').click());await pause();
  await run(()=>document.getElementById('tab-protected').scrollIntoView({block:'start'}));await pause();
  assert.equal(await run(()=>document.querySelectorAll('.protection-chip').length>=15),true);
  const search=await run(()=>{const node=document.getElementById('search-protected');return {width:node.getBoundingClientRect().width,placeholder:node.placeholder};});assert.ok(search.width>250);
  await capture('protected.png');
  await run(()=>document.querySelector('.nav-item[data-tab="dashboard"]').click());await pause();
  page.send('status-changed',{status:'active',activeRule:{name:'Arayüz test örneği'},closedApps:['spotify.exe'],report:{ruleName:'Arayüz test örneği',at:new Date().toISOString(),closedApps:[{name:'spotify.exe'}],failed:[],launches:[],details:[{name:'spotify.exe',outcome:'closed'},{name:'nvcontainer.exe',outcome:'skipped',reason:'unsupported'}]}});
  await pause();
  assert.equal(await run(()=>document.getElementById('session-results').textContent.includes('Atlandı')),false);
  assert.equal(await run(()=>document.querySelector('#operation-logs #last-session-rows').textContent.includes('nvcontainer.exe')),true);
  await capture('dashboard.png');
  page.send('status-changed',{status:'idle',exitDeadline:Date.now()+170000});await pause();
  assert.equal(await run(()=>document.getElementById('exit-countdown').hidden),false);
  await run(()=>window._countdownNotice=document.getElementById('exit-countdown'));
  page.send('status-changed',{status:'idle',exitDeadline:Date.now()+110000});await pause();
  assert.equal(await run(()=>window._countdownNotice===document.getElementById('exit-countdown')),true);assert.equal(await run(()=>document.querySelectorAll('#exit-countdown').length),1);
  await capture('countdown.png');
  return {themes:true,tourTabs:tabs,autoRestorePreference:true,discoveredGameProfile:true,explorerCancel:true,selectedExitRestoreField:true,quietDashboard:true,profileSteps:true,bulkExpansion:true,diagnosticsExport:true,protectedSearchWidth:search.width,singleCountdown:true};
};
