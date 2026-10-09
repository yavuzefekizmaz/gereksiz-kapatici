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
    stdout: JSON.stringify([{ name: 'chrome.exe', path: 'C:\\Apps\\chrome.exe' }])
  }));
  const result = await optimizer.killProcesses([' CHROME ', 'chrome.exe']);
  assert.equal(commands.length, 1);
  const [exe, args, options] = commands[0];
  assert.equal(exe, 'powershell.exe');
  assert.equal(options.timeout, 10000);
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
    assert.equal(result.failed[0], 'spotify.exe');
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
    getRunningProcesses: async () => [{ name: 'chrome.exe', path: 'C:\\Apps\\chrome.exe' }]
  });
  await optimizer.relaunchProcesses([{ name: 'chrome.exe', path: 'C:\\Apps\\chrome.exe' }]);
  assert.equal(commands.length, 0);
});
