// Mark quitting before Electron's close handlers can hide the window in the tray.
function finishGameSession({ app, monitor, tray, clearTimers, saveReport }, report) {
  try { saveReport(report); } catch (err) { console.warn('İşlem raporu kaydedilemedi:', err.message); }
  app.isQuitting = true;
  monitor.stop();
  clearTimers();
  if (tray && !tray.isDestroyed()) tray.destroy();
  app.quit();
}
module.exports = { finishGameSession };
