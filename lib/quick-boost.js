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
      result = { mode: 'quick-boost', at: new Date().toISOString(), detected: false,
        message: 'Açık oyun bulunamadı; hiçbir uygulama kapatılmadı.' };
    } else {
      const applied = await monitor.triggerRuleManually(check.rule);
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
