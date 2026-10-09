const { test } = require('node:test');
const assert = require('node:assert/strict');
const util = require('node:util');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// Load the Windows code with fake OS commands; never touch real processes.
function loadOptimizer(respond = async () => ({ stdout: '[]' }), scanner = {}) {
  const commands = [];
  const execFile = () => { throw new Error('Unexpected callback execution'); };
  execFile[util.promisify.custom] = async (...args) => {
    commands.push(args);
    return respond(...args);
  };
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(__dirname, '../lib/ram-optimizer.js'), 'utf8');
  vm.runInNewContext(source, {
    module, exports: module.exports, Buffer, console,
    process: { platform: 'win32', execPath: 'C:\\Voldena\\voldena.exe' },
    require: name => name === 'child_process'
      ? { exec: () => { throw new Error('Shell commands forbidden'); }, execFile }
      : name === './app-scanner' ? scanner : require(name)
  });
  return { optimizer: module.exports, commands };
}

test('system, launcher, driver, game and invalid targets never run a command', async () => {
  const { optimizer, commands } = loadOptimizer();
  const result = await optimizer.killProcesses([
    'winlogon.exe', 'svchost.exe', 'explorer.exe', 'steam.exe', 'vgc.exe',
    'nvcontainer.exe', 'lghub.exe', 'cs2.exe', 'unknown.exe', '*.exe',
    'chrome.exe" & calc.exe', 'C:\\Windows\\chrome.exe', null, 42
  ]);
  assert.equal(commands.length, 0);
  assert.equal(result.closedApps.length, 0);
});

test('protected names without extension and mixed case are respected', async () => {
  const { optimizer, commands } = loadOptimizer();
  await optimizer.killProcesses(['Chrome.EXE', 'discord.exe'], [' CHROME ', 'Discord']);
  assert.equal(commands.length, 0);
});

test('normal close uses encoded PowerShell, session/path/window checks and no force', async () => {
  const { optimizer, commands } = loadOptimizer(async () => ({
    stdout: JSON.stringify([{ name: 'chrome.exe', path: 'C:\\Apps\\chrome.exe', closed: true }])
  }));
  const result = await optimizer.killProcesses([' CHROME ', 'chrome.exe']);
  assert.equal(commands.length, 1);
  const [exe, args, options] = commands[0];
  assert.equal(exe, 'powershell.exe');
  assert.equal(options.timeout, 15000);
  const script = Buffer.from(args.at(-1), 'base64').toString('utf16le');
  assert.match(script, /CloseMainWindow\(\)/);
  assert.match(script, /WaitForExit\(1500\)/);
  assert.match(script, /SessionId -ne \$sessionId/);
  assert.match(script, /\$env:windir/);
  assert.match(script, /GetFileName/);
  assert.match(script, /MainWindowHandle/);
  assert.doesNotMatch(script, /taskkill|Stop-Process|\.Kill\(/i);
  assert.equal(result.killed[0], 'chrome.exe');
  assert.equal(result.closedApps[0].path, 'C:\\Apps\\chrome.exe');
});

test('absent, refused, timed-out and failed closes are never added to restore history', async () => {
  for (const respond of [async () => ({ stdout: '[]' }), async () => { throw new Error('timeout'); }]) {
    const { optimizer } = loadOptimizer(respond);
    const result = await optimizer.killProcesses(['spotify.exe']);
    assert.equal(result.closedApps.length, 0);
    assert.equal(result.killed.length, 0);
    assert.equal(result.failed[0] || result.skipped[0], 'spotify.exe');
  }
});

test('legacy aggressive methods cannot mutate the OS', async () => {
  const { optimizer, commands } = loadOptimizer();
  await optimizer.smartSweepProcesses([], 'cs2.exe');
  await optimizer.setProcessHighPriority('cs2.exe');
  await optimizer.pauseNonEssentialServices();
  await optimizer.restoreNonEssentialServices();
  assert.equal(await optimizer.stopExplorer(), false);
  assert.equal((await optimizer.trimWorkingSets()).disabled, true);
  assert.equal(commands.length, 0);
});

const ProcessMonitor = require('../lib/process-monitor');
const RamOptimizer = require('../lib/ram-optimizer');

test('old high/sweep/explorer settings cannot activate aggressive actions; protect the game', async () => {
  const methods = ['setProcessHighPriority', 'smartSweepProcesses', 'pauseNonEssentialServices',
    'stopExplorer', 'trimWorkingSets', 'restoreNonEssentialServices', 'killProcesses', 'relaunchProcesses'];
  const original = new Map(methods.map(name => [name, RamOptimizer[name]]));
  let closeArgs;
  try {
    for (const name of methods) RamOptimizer[name] = async () => {
      throw new Error(`Unsafe or unexpected action: ${name}`);
    };
    RamOptimizer.killProcesses = async (...args) => {
      closeArgs = args;
      return { closedApps: [] };
    };
    const monitor = new ProcessMonitor({});
    await monitor.handleRuleTrigger({ id: 'test', name: 'Game', triggerProcess: 'cs2.exe',
      optimizationLevel: 'high', smartSweep: true, keepExplorer: false,
      closeTargets: ['chrome.exe', 'cs2.exe'] }, {}, ['anydesk.exe']);
    assert.ok(closeArgs[1].includes('cs2.exe'));
    assert.equal(monitor.explorerStopped, false);
    await monitor.handleRuleExit({});
    assert.equal(monitor.activeRuleId, null);
    // An explicitly empty target list must not fall back to defaults.
    closeArgs = null;
    await monitor.handleRuleTrigger({ id: 'empty', triggerProcess: 'cs2.exe',
      closeTargets: [], optimizationLevel: 'medium' }, { defaultCloseTargets: ['chrome.exe'] }, []);
    assert.equal(closeArgs, null);
  } finally {
    for (const [name, fn] of original) RamOptimizer[name] = fn;
  }
});

test('a failed process poll does not exit the game or reopen apps', async () => {
  const monitor = new ProcessMonitor({});
  monitor.activeRuleId = 'test';
  monitor.activeRule = { triggerProcess: 'cs2.exe' };
  monitor.fetchRunningProcesses = async () => null;
  monitor.handleRuleExit = async () => { throw new Error('False game exit'); };
  await monitor.tick();
  assert.equal(monitor.activeRuleId, 'test');
  assert.equal(monitor.isProcessing, false);
});

test('already running companions are skipped by exe name or Windows path', async () => {
  const running = [{ name: 'Valorant Tracker.exe', path: 'C:\\Apps\\Valorant Tracker.exe' }];
  const scanner = {
    getRunningProcesses: async options => { assert.equal(options.throwOnError, true); return running; },
    resolveExecutablePath: async () => { throw new Error('Unnecessary resolution'); }
  };
  for (const target of ['VALORANT TRACKER.EXE', 'Valorant Tracker', 'c:\\apps\\Valorant Tracker.exe']) {
    const { optimizer, commands } = loadOptimizer(undefined, scanner);
    assert.equal(await optimizer.launchTarget(target), false);
    assert.equal(commands.length, 0);
  }
});

test('resolved companion executable is checked too', async () => {
  const { optimizer, commands } = loadOptimizer(undefined, {
    getRunningProcesses: async () => [{ name: 'ActualTracker.exe', path: 'C:\\Apps\\ActualTracker.exe' }],
    resolveExecutablePath: async () => 'C:\\Apps\\ActualTracker.exe'
  });
  assert.equal(await optimizer.launchTarget('Tracker'), false);
  assert.equal(commands.length, 0);
});

test('closed companion starts once, with spaces preserved', async () => {
  const { optimizer, commands } = loadOptimizer(async () => ({ stdout: '' }), {
    getRunningProcesses: async () => [],
    resolveExecutablePath: async () => 'C:\\Apps\\Valorant Tracker.exe'
  });
  assert.equal(await optimizer.launchTarget('Valorant Tracker.exe'), true);
  assert.equal(commands.length, 1);
  const script = Buffer.from(commands[0][1].at(-1), 'base64').toString('utf16le');
  assert.ok(script.includes("Start-Process -FilePath 'C:\\Apps\\Valorant Tracker.exe'"));
});

test('failed inspection does not start a duplicate companion', async () => {
  const { optimizer, commands } = loadOptimizer(undefined, {
    getRunningProcesses: async () => { throw new Error('Process inspection failed'); }
  });
  assert.equal(await optimizer.launchTarget('Tracker.exe'), false);
  assert.equal(commands.length, 0);
});

test('restoring an app the user already reopened does not launch it again', async () => {
  const { optimizer, commands } = loadOptimizer(undefined, {
    getRunningProcesses: async () => [{ name: 'chrome.exe', path: 'C:\\Apps\\chrome.exe', closed: true }]
  });
  await optimizer.relaunchProcesses([{ name: 'chrome.exe', path: 'C:\\Apps\\chrome.exe', closed: true }]);
  assert.equal(commands.length, 0);
});

test('selected tray apps get bounded PID-only fallback; NVIDIA driver components never do', async () => {
  const { optimizer, commands } = loadOptimizer();
  await optimizer.killProcesses(['AnyDesk.exe', 'OneDrive.exe', 'Overwolf.exe', 'nvcontainer.exe', 'nvidia overlay.exe', 'nvidia app.exe', 'nvcplui.exe']);
  const scripts = commands.map(command => Buffer.from(command[1].at(-1), 'base64').toString('utf16le'));
  assert.equal(scripts.length, 8); // Three Overwolf helpers belong to the selected app.
  for (const script of scripts) {
    assert.doesNotMatch(script, /taskkill|Stop-Service|Stop-Process|\/T\b/);
    if (script.includes("-Name 'nvidia app'") || script.includes("-Name 'nvcplui'")) {
      assert.doesNotMatch(script, /\.Kill\(/);
      assert.match(script, /CloseMainWindow/);
    } else {
      assert.match(script, /\$current\.Kill\(\)/);
      assert.match(script, /StartTime\.ToUniversalTime\(\)\.Ticks -eq \$startedAt/);
      assert.match(script, /\$current\.Path -ieq \$exePath/);
      assert.match(script, /\$current\.SessionId -ne 0/);
    }
  }
  const oneDrive = scripts.find(script => script.includes("-Name 'onedrive'"));
  assert.match(oneDrive, /ArgumentList '\/shutdown'/);
  assert.match(oneDrive, /shutdownPaths\.ContainsKey/);
});

test('tray termination can be disabled and protected helpers remain untouched', async () => {
  const { optimizer, commands } = loadOptimizer();
  await optimizer.killProcesses(['overwolf.exe'], ['overwolfbrowser.exe'], { forceTrayApps: false });
  assert.equal(commands.length, 3);
  for (const command of commands) {
    const script = Buffer.from(command[1].at(-1), 'base64').toString('utf16le');
    assert.doesNotMatch(script, /\.Kill\(/);
    assert.doesNotMatch(script, /-Name 'overwolfbrowser'/);
  }
});

test('partially closed multiple instances are reported as partial, not complete', async () => {
  const { optimizer } = loadOptimizer(async () => ({ stdout: JSON.stringify([
    { name: 'onedrive.exe', path: 'C:\\Apps\\OneDrive.exe', closed: true },
    { name: 'onedrive.exe', path: 'C:\\Other\\OneDrive.exe', closed: false }
  ]) }));
  const result = await optimizer.killProcesses(['onedrive.exe']);
  assert.equal(result.details[0].outcome, 'partial');
  assert.equal(result.details[0].remainingInstances, 1);
  assert.equal(result.failed[0], 'onedrive.exe');
});

test('Voldena completion waits for all closing attempts and stops monitoring', async () => {
  const original = RamOptimizer.killProcesses;
  let resolve;
  const events = [];
  try {
    RamOptimizer.killProcesses = () => new Promise(done => { resolve = done; });
    const monitor = new ProcessMonitor({}, null, () => events.push('status'), report => {
      assert.equal(report.failed[0], 'anydesk.exe');
      events.push('quit');
    });
    monitor.stop = () => events.push('stop');
    const pending = monitor.handleRuleTrigger({ id: 'game', triggerProcess: 'cs2.exe',
      optimizationLevel: 'medium', closeTargets: ['anydesk.exe'] }, { exitAfterOptimization: true }, []);
    assert.deepEqual(events, []);
    resolve({ killed: [], failed: ['anydesk.exe'], closedApps: [], skipped: [], details: [] });
    await pending;
    assert.deepEqual(events, ['status', 'stop', 'quit']);
  } finally { RamOptimizer.killProcesses = original; }
});

test('keeping Voldena open is still an explicit option', async () => {
  const monitor = new ProcessMonitor({}, null, null, () => { throw new Error('Unexpected exit'); });
  await monitor.handleRuleTrigger({ id: 'game', triggerProcess: 'cs2.exe', closeTargets: [] },
    { exitAfterOptimization: false }, []);
  assert.equal(monitor.activeRuleId, 'game');
});

test('Windows PowerShell parses generated close scripts without running any closing code',
  { skip: process.platform !== 'win32' }, async () => {
  const { optimizer, commands } = loadOptimizer();
  await optimizer.killProcesses(['chrome.exe', 'onedrive.exe', 'anydesk.exe', 'overwolf.exe', 'nvidia app.exe', 'nvcplui.exe']);
  for (const command of commands) {
    const encoded = command[1].at(-1);
    const parser = `
$source = [System.Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${encoded}'));
$tokens = $null; $errors = $null;
[System.Management.Automation.Language.Parser]::ParseInput($source, [ref]$tokens, [ref]$errors) | Out-Null;
if ($errors.Count -gt 0) { $errors | ForEach-Object { Write-Output $_.Message }; exit 1 }
`;
    childProcess.execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand',
      Buffer.from(parser, 'utf16le').toString('base64')], { timeout: 10000, windowsHide: true });
  }
});
