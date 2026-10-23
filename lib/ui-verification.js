// Runs only with --voldena-safe-test --verify-ui, against isolated user data.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
module.exports=async function verifyUI(page,directory){
  const run=fn=>page.executeJavaScript(`(${fn.toString()})()`);
  const pause=()=>new Promise(resolve=>setTimeout(resolve,350));
  for(let n=0;n<100;n++){if(await run(()=>document.body.dataset.experienceReady==='true'))break;await pause();}
  assert.equal(await run(()=>!!document.querySelector('.theme-settings')),true,'Theme/tour initialization failed');
  await run(()=>window.voldenaAPI.updateSettings({autoRestoreOnExit:false,exitAfterOptimization:true}));
  await run(()=>document.querySelector('.nav-item[data-tab="settings"]').click());
  await run(()=>document.querySelectorAll('.theme-choice')[6].click());await pause();
  assert.equal(await run(()=>document.body.dataset.themeLight),'true');
  fs.writeFileSync(path.join(directory,'theme-light.png'),(await page.capturePage()).toPNG());
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
  await run(()=>document.querySelector('.discovered-game-card').click());await pause();
  assert.equal(await run(()=>document.getElementById('rule-form-trigger').value),'VoldenaFixtureGame.exe');
  await run(()=>document.getElementById('rule-form-exit-launch').value='VoldenaFixtureRestore.exe');
  await run(()=>document.getElementById('btn-save-rule').click());await pause();
  assert.equal(await run(async()=>(await window.voldenaAPI.getRules()).some(rule=>rule.exitLaunchTargets?.includes('VoldenaFixtureRestore.exe'))),true);
  assert.equal(await run(()=>document.querySelector('.nav-item.active').dataset.tab),'game-optimization');
  await run(()=>document.querySelector('.nav-item[data-tab="settings"]').click());
  await run(()=>document.getElementById('setting-keep-explorer').click());await pause();
  assert.equal(await run(()=>document.getElementById('modal-confirm').classList.contains('active')),true);
  await run(()=>document.getElementById('btn-confirm-cancel').click());await pause();
  assert.equal(await run(()=>document.getElementById('setting-keep-explorer').checked),true);
  fs.writeFileSync(path.join(directory,'settings.png'),(await page.capturePage()).toPNG());
  await run(()=>document.querySelector('.nav-item[data-tab="protected"]').click());await pause();
  fs.writeFileSync(path.join(directory,'protected.png'),(await page.capturePage()).toPNG());
  await run(()=>document.querySelector('.nav-item[data-tab="dashboard"]').click());await pause();
  page.send('status-changed',{status:'active',activeRule:{name:'Arayüz test örneği'},closedApps:['spotify.exe'],report:{ruleName:'Arayüz test örneği',at:new Date().toISOString(),closedApps:[{name:'spotify.exe'}],failed:[],launches:[],details:[{name:'spotify.exe',outcome:'closed'},{name:'nvcontainer.exe',outcome:'skipped',reason:'unsupported'}]}});
  await pause();
  assert.equal(await run(()=>document.getElementById('session-results').textContent.includes('Atlandı')),false);
  assert.equal(await run(()=>document.querySelector('#operation-logs #last-session-rows').textContent.includes('nvcontainer.exe')),true);
  fs.writeFileSync(path.join(directory,'dashboard.png'),(await page.capturePage()).toPNG());
  return {themes:true,tourTabs:tabs,autoRestorePreference:true,discoveredGameProfile:true,explorerCancel:true,selectedExitRestoreField:true,quietDashboard:true};
};
