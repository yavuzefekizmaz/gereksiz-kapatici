const { test } = require('node:test');
const assert = require('node:assert/strict');
const { quickBoost } = require('../lib/quick-boost');
const ProcessMonitor = require('../lib/process-monitor');
const GameDetector = require('../lib/game-detector');

test('quick boost immediately applies an already running game then saves and exits', async () => {
  const events=[];
  const monitor={stop:()=>events.push('stop'), detectRunningGameNow:async options=>{
    assert.equal(options.gamesOnly,true); return {isRunning:true,rule:{name:'Game'}};
  },triggerRuleManually:async()=>{events.push('apply');return {closedCount:1,report:{failed:[]}};}};
  const result=await quickBoost(monitor,{memory:()=>({free:123}),save:()=>events.push('save'),notify:()=>events.push('notify'),quit:()=>events.push('quit')});
  assert.equal(result.detected,true);
  assert.deepEqual(events,['stop','apply','save','notify','quit']);
});
test('missing game and failed detection never apply a profile and always exit', async()=>{
  for(const fail of [false,true]) {
    let applied=false,exited=false;
    const result=await quickBoost({stop(){},detectRunningGameNow:async()=>{if(fail)throw Error('poll failed');return {isRunning:false};},triggerRuleManually:()=>{applied=true;}},
      {memory:()=>({}),save(){},notify(){},quit(){exited=true;}});
    assert.equal(applied,false);assert.equal(exited,true);
    assert.equal(fail?result.error:result.detected,fail?'poll failed':false);
  }
});
test('busy operation is neither interrupted nor quit',async()=>{
  await quickBoost({isProcessing:true,stop(){assert.fail();}}, {notify(){},quit(){assert.fail();}});
});
test('one-shot excludes configured IDEs and wallpaper helpers while protecting every active game',async()=>{
  const rules=['antigravity','webwallpaper64','cs2','othergame'].map(name=>({id:name,name,triggerProcess:name+'.exe',enabled:true,closeTargets:[]}));
  const monitor=new ProcessMonitor({getSettings:()=>({autoGameDetection:false}),getRules:()=>rules,getProtectedApps:()=>[]},new GameDetector({}));
  monitor.fetchRunningProcesses=async()=>new Set(rules.map(r=>r.triggerProcess));
  const detected=await monitor.detectRunningGameNow({gamesOnly:true});
  assert.equal(detected.rule.id,'cs2');
  monitor.handleRuleTrigger=async(_rule,_settings,protectedApps)=>{
    assert.ok(protectedApps.includes('othergame.exe'));return {closedApps:[],failed:[]};
  };
  await monitor.triggerRuleManually(detected.rule);
});
