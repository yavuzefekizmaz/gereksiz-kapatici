// A separate one-shot entry point: no monitoring interval or delayed game exit.
async function quickBoost(monitor, { memory, save, notify, quit, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  let result;
  try {
    if (monitor.installing) {
      notify('Voldena şu anda başka bir işlem yapıyor. Tamamlanınca tekrar deneyin.');
      return;
    }
    // A normal process poll must not make the shortcut randomly refuse to run.
    for (let attempts = 0; monitor.isProcessing && attempts < 300; attempts++) await wait(100);
    if (monitor.isProcessing || monitor.installing) {
      notify('Voldena işlemi hâlâ sürüyor. Tamamlanınca tekrar deneyin.');
      return;
    }
    monitor.stop();
    monitor.quickMode=true;
    const before = memory();
    const check = await monitor.detectRunningGameNow({ gamesOnly: true });
    if (!check.isRunning) {
      const settings=monitor.ruleStore?.getSettings()||{};
      const targets=settings.quickIdleEnabled===false?[]:(settings.quickIdleCloseTargets||['anydesk.exe']);
      const applied=targets.length?await monitor.triggerRuleManually({id:'quick-idle',name:'Oyun dışı hafif hızlandırma',closeTargets:targets,launchTargets:[],exitLaunchTargets:[],optimizationLevel:'medium',keepExplorer:true,useBulkClose:false}):null;
      if(applied?.busy)throw Error(applied.message);
      result = { mode: 'quick-boost', at: new Date().toISOString(), detected: false,
        idleMode:true,...(applied||{}),memoryBefore:before,memoryAfter:memory(),
        message: applied?`Açık oyun yok. Hafif hızlandırma listesinden ${applied.closedCount||0} uygulama kapatıldı. Ayrıntılar İşlem Günlüklerinde.`:'Açık oyun yok; oyun dışı kapatma listesi boş veya kapalı. Hiçbir uygulama kapatılmadı.' };
    } else {
      const applied = await monitor.triggerRuleManually(check.rule);
      if(applied.busy)throw Error(applied.message);
      result = { mode: 'quick-boost', at: new Date().toISOString(), detected: true,
        game: check.rule.name, ...applied, memoryBefore: before, memoryAfter: memory() };
      const failed = applied.report.failed.length;
      result.message = `${check.rule.name}: ${applied.closedCount} uygulama kapatıldı${failed ? `, ${failed} işlem tamamlanamadı` : ''}. İşlemler bitti; Voldena kapanıyor.`;
      if(applied.report.exitRestore?.armed===false){
        result.message='Bağımsız geri açma izleyicisi başlatılamadı. Seçtiğiniz uygulamaları geri açabilmek için Voldena oyun bitene kadar arka planda kalacak.';
        monitor.sessions.set(check.rule.id,{rule:check.rule,identities:monitor.matchingIdentities(check.rule,monitor.lastRunningProcesses),report:applied.report,exitEligible:false});
        monitor.quitWhenRestoreComplete=true;monitor.start();save(result);notify(result.message);return result;
      }
    }
  } catch (err) {
    result = { mode: 'quick-boost', at: new Date().toISOString(), error: err.message,
      message: 'Hızlandırma tamamlanamadı: ' + err.message };
  }
  try { save(result); notify(result.message); } finally { quit(result); }
  return result;
}
module.exports = { quickBoost };
