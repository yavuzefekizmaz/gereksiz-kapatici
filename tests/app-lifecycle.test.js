const { test } = require('node:test');
const assert = require('node:assert/strict');
const { finishGameSession } = require('../lib/app-lifecycle');

test('completion truly quits instead of hiding, destroys tray and clears timers', () => {
  const events = [];
  const report = { failed: ['anydesk.exe'] };
  const app = { isQuitting: false, quit: () => events.push('quit') };
  finishGameSession({
    app,
    monitor: { stop: () => { assert.equal(app.isQuitting, true); events.push('stop'); } },
    tray: { isDestroyed: () => false, destroy: () => events.push('destroy-tray') },
    clearTimers: () => events.push('clear-timers'),
    saveReport: data => { assert.equal(data, report); events.push('save-report'); }
  }, report);
  assert.deepEqual(events, ['save-report', 'stop', 'clear-timers', 'destroy-tray', 'quit']);
});

test('report write failure does not leave Voldena running', () => {
  let exited = false;
  finishGameSession({ app: { quit: () => { exited = true; } }, monitor: { stop() {} },
    clearTimers() {}, saveReport() { throw new Error('read-only'); } }, {});
  assert.equal(exited, true);
});
