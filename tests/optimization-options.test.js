const {test}=require('node:test'),assert=require('node:assert/strict');
const Monitor=require('../lib/process-monitor'),Optimizer=require('../lib/ram-optimizer');
test('Explorer requires new explicit consent, default and legacy false flags never acquire the desktop',async()=>{
  const monitor=new Monitor({});let acquired=0;
  monitor.lastRunningProcesses=new Set(['game.exe']);monitor.desktopGuard={acquire:async()=>{acquired++;}};
  const rule={id:'game',triggerProcess:'game.exe',closeTargets:[],launchTargets:[]};
  await monitor.handleRuleTrigger(rule,{keepExplorer:true},[]);assert.equal(acquired,0);
  await monitor.handleRuleTrigger({...rule,keepExplorer:false},{keepExplorer:false},[]);assert.equal(acquired,0);
  await monitor.handleRuleTrigger({...rule,keepExplorer:false,desktopClosureConsentVersion:1},{},[]);assert.equal(acquired,1);
  monitor.quickMode=true;await monitor.handleRuleTrigger({...rule,keepExplorer:false,desktopClosureConsentVersion:1},{},[]);assert.equal(acquired,1);
});
test('bulk selection merges only configured names and retains the protected/game boundaries',async()=>{
  const original=Optimizer.killProcesses;let args;
  Optimizer.killProcesses=async(...values)=>{args=values;return {closedApps:[],details:[],failed:[]};};
  try{
    const monitor=new Monitor({});
    await monitor.handleRuleTrigger({id:'game',triggerProcess:'game.exe',closeTargets:['chrome.exe']},{selectedBulkCloseEnabled:true,defaultCloseTargets:['spotify.exe','chrome.exe']},['discord.exe']);
    assert.deepEqual(args[0],['chrome.exe','spotify.exe']);assert.ok(args[1].includes('game.exe'));assert.ok(args[1].includes('discord.exe'));
  }finally{Optimizer.killProcesses=original;}
});
test('an idle quick rule cannot inherit the game bulk list even when bulk closing is enabled',async()=>{
  const original=Optimizer.killProcesses;let targets;
  Optimizer.killProcesses=async names=>{targets=names;return {closedApps:[],details:[],failed:[]};};
  try{await new Monitor({}).handleRuleTrigger({id:'quick-idle',closeTargets:['anydesk.exe'],useBulkClose:false,optimizationLevel:'medium',keepExplorer:true},{selectedBulkCloseEnabled:true,defaultCloseTargets:['chrome.exe','spotify.exe']},[]);assert.deepEqual(targets,['anydesk.exe']);}finally{Optimizer.killProcesses=original;}
});
