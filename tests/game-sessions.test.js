const {test}=require('node:test');
const assert=require('node:assert/strict');
const ProcessMonitor=require('../lib/process-monitor');
function fixture() {
  let now=1000, running=new Set(), applyCount=0, quits=0, timerId=0;
  const timers=new Map();
  const settings={exitAfterOptimization:true,autoGameDetection:false};
  const rules=['game','other'].map(name=>({id:name,name,triggerProcess:name+'.exe',enabled:true,closeTargets:[]}));
  const monitor=new ProcessMonitor({getSettings:()=>settings,getRules:()=>rules,getProtectedApps:()=>[]},null,null,()=>quits++,{
    now:()=>now,setTimeout:(fn,ms)=>{timers.set(++timerId,{fn,at:now+ms});return timerId;},clearTimeout:id=>timers.delete(id)
  });
  monitor.fetchRunningProcesses=async()=>running;
  monitor.handleRuleTrigger=async()=>{applyCount++;return {closedApps:[],failed:[]};};
  return {monitor,settings,timers,setRunning:value=>running=value===null?null:new Set(value),
    setRows:rows=>{running=new Set(rows.map(r=>r.name));running.identities=new Map(rows.map(r=>[r.name,[r.id]]));},
    advance:async ms=>{now+=ms;for(const [id,timer] of [...timers])if(timer.at<=now){timers.delete(id);await timer.fn();}},
    count:()=>applyCount,quits:()=>quits,time:()=>now};
}
test('already running game at manual startup never applies or quits',async()=>{
  const f=fixture();f.setRunning(['game.exe']);await f.monitor.tick();await f.monitor.tick();await f.advance(120000);
  assert.equal(f.count(),0);assert.equal(f.quits(),0);assert.equal(f.timers.size,0);
});
test('new game applies once; 60-second clock starts after operations finish',async()=>{
  const f=fixture();await f.monitor.tick();f.setRunning(['game.exe']);
  let finish;f.monitor.handleRuleTrigger=()=>new Promise(resolve=>finish=resolve);
  const pending=f.monitor.tick();await new Promise(resolve=>setImmediate(resolve));
  await f.advance(30000);assert.equal(f.timers.size,0);
  finish({closedApps:[]});await pending;assert.equal(f.monitor.exitDeadline,f.time()+60000);
  await f.monitor.tick();assert.equal(f.timers.size,1);await f.advance(59999);assert.equal(f.quits(),0);
  await f.advance(1);assert.equal(f.quits(),1);
});
test('turning exit off cancels pending exit and does not restart it for the same game',async()=>{
  const f=fixture();await f.monitor.tick();f.setRunning(['game.exe']);await f.monitor.tick();
  f.settings.exitAfterOptimization=false;f.monitor.settingsChanged();assert.equal(f.timers.size,0);
  f.settings.exitAfterOptimization=true;await f.monitor.tick();await f.advance(120000);assert.equal(f.quits(),0);assert.equal(f.count(),1);
});
test('game closes during countdown: timer cancelled; restart is a new session',async()=>{
  const f=fixture();await f.monitor.tick();f.setRunning(['game.exe']);await f.monitor.tick();
  f.setRunning([]);await f.monitor.tick();assert.equal(f.timers.size,0);
  f.setRunning(['game.exe']);await f.monitor.tick();assert.equal(f.count(),2);await f.advance(60000);assert.equal(f.quits(),1);
});
test('baseline process restart with same exe but different PID is a new game',async()=>{
  const f=fixture();f.setRows([{name:'game.exe',id:'10:100'}]);await f.monitor.tick();
  f.setRows([{name:'game.exe',id:'11:200'}]);await f.monitor.tick();assert.equal(f.count(),1);
});
test('overlapping games each apply once and share one timer after latest completion',async()=>{
  const f=fixture();await f.monitor.tick();f.setRunning(['game.exe']);await f.monitor.tick();await f.advance(10000);
  f.setRunning(['game.exe','other.exe']);await f.monitor.tick();await f.monitor.tick();
  assert.equal(f.count(),2);assert.equal(f.timers.size,1);await f.advance(50000);assert.equal(f.quits(),0);
  await f.advance(10000);assert.equal(f.quits(),1);
});
test('exit disabled, failed polls and updates cannot cause a blind exit',async()=>{
  for(const variant of ['disabled','failed','update']) {
    const f=fixture();await f.monitor.tick();f.setRunning(['game.exe']);await f.monitor.tick();
    if(variant==='disabled'){f.settings.exitAfterOptimization=false;f.monitor.settingsChanged();}
    if(variant==='failed'){f.setRunning(null);await f.monitor.tick();}
    if(variant==='update')f.monitor.setInstalling(true);
    await f.advance(60000);assert.equal(f.quits(),0,variant);
  }
});
test('game disappears at final validation without another poll: no exit',async()=>{
  const f=fixture();await f.monitor.tick();f.setRunning(['game.exe']);await f.monitor.tick();f.setRunning([]);await f.advance(60000);assert.equal(f.quits(),0);
});
