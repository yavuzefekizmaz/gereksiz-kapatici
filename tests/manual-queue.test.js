const {test}=require('node:test'),assert=require('node:assert/strict');const Monitor=require('../lib/process-monitor');
test('manual detection waits for a normal poll, prevents the next poll from taking its turn, and applies once',async()=>{
  const rule={id:'game',name:'Game',enabled:true,triggerProcess:'game.exe',closeTargets:[],launchTargets:[]};let waited=0,applied=0;
  const store={getSettings:()=>({}),getRules:()=>[rule],getProtectedApps:()=>[]};
  const monitor=new Monitor(store,null,null,null,{wait:async()=>{waited++;await monitor.tick();monitor.isProcessing=false;}});
  monitor.isProcessing=true;monitor.fetchRunningProcesses=async()=>new Set(['game.exe']);
  monitor.handleRuleTrigger=async()=>{applied++;return {closedApps:[],failed:[]};};
  const result=await monitor.manualDetectAndBoost();assert.equal(result.detected,true);assert.equal(applied,1);assert.equal(waited,1);assert.equal(monitor.isProcessing,false);assert.equal(monitor.manualWaiters,0);
});
test('an installing app returns a readable busy result without closing any application',async()=>{
  const monitor=new Monitor({getSettings:()=>({})});monitor.installing=true;
  monitor.handleRuleTrigger=()=>assert.fail();const result=await monitor.manualDetectAndBoost();assert.equal(result.busy,true);assert.equal(monitor.isProcessing,false);
});
