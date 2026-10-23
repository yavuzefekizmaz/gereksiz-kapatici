const { exec, execFile } = require('child_process');
const util = require('util');
const path = require('path');
const os = require('os');
const fs = require('fs');
const execPromise = util.promisify(exec);
const execAsync = (command, options = {}) => execPromise(command, { windowsHide: true, timeout: 10000, ...options });
const execFileAsync = util.promisify(execFile);
const AppScanner = require('./app-scanner');

// Built-in core Windows system processes that must NEVER be killed
const currentExecutableName = path.basename(process.execPath).toLowerCase();
const CORE_WINDOWS_SYSTEM_PROCESSES = new Set([
  'system', 'idle', 'csrss.exe', 'smss.exe', 'wininit.exe', 'services.exe',
  'lsass.exe', 'winlogon.exe', 'svchost.exe', 'fontdrvhost.exe', 'wuauclt.exe', 'spoolsv.exe',
  'dwm.exe', 'conhost.exe', 'sihost.exe', 'taskhostw.exe', 'explorer.exe',
  'ctfmon.exe', 'shellexperiencehost.exe', 'startmenuexperiencehost.exe',
  'searchapp.exe', 'searchindexer.exe', 'audiodg.exe', 'securityhealthservice.exe',
  'smartscreen.exe', 'voldena.exe', 'electron.exe', 'node.exe',
  'voldena oyun hizlandiricisi.exe', 'voldena oyun hizlandiricisi',
  currentExecutableName
]);

// Game launchers and store clients that must NEVER be killed automatically
const LAUNCHER_PROCESSES = new Set([
  'steam.exe', 'steamservice.exe', 'steamwebhelper.exe',
  'riotclientservices.exe', 'riotclientux.exe', 'riotclientuxrender.exe', 'vgc.exe', 'vgtray.exe',
  'epicgameslauncher.exe', 'epicwebhelper.exe',
  'eadesktop.exe', 'origin.exe', 'eaconnect_chime.exe', 'eabackgroundservice.exe', 'link2ea.exe',
  'battle.net.exe', 'agent.exe', 'battle.net launcher.exe',
  'upc.exe', 'ubisoftconnect.exe', 'uplay.exe',
  'rockstargameslauncher.exe', 'launcher.exe', 'launcherupdater.exe', 'rockstarservice.exe', 'socialclubhelper.exe',
  'gog galaxy.exe', 'galaxyclient.exe', 'galaxyservice.exe',
  'bethesdanetlauncher.exe', 'hoyoplay.exe'
]);

// Deliberately narrow list: hardware tools, antivirus, games and unknown processes
// must remain running even when an old configuration explicitly targets them.
const CLOSEABLE_USER_APPS = new Set([
  'chrome.exe', 'msedge.exe', 'opera.exe', 'firefox.exe', 'brave.exe',
  'discord.exe', 'discordptb.exe', 'discordcanary.exe', 'spotify.exe',
  'telegram.exe', 'whatsapp.exe', 'skype.exe', 'vlc.exe',
  'onedrive.exe', 'anydesk.exe', 'overwolf.exe', 'overwolfbrowser.exe',
  'overwolfhelper.exe', 'overwolflauncher.exe', 'nvidia app.exe', 'nvapp.exe', 'nvcplui.exe'
]);

// Only explicitly selected tray apps may use PID termination after normal exit.
// NVIDIA programs are window-close only; driver/container/overlay processes are excluded.
const TRAY_EXIT_APPS = new Set([
  'onedrive.exe', 'anydesk.exe', 'overwolf.exe', 'overwolfbrowser.exe',
  'overwolfhelper.exe', 'overwolflauncher.exe'
]);

class RamOptimizer {
  /**
   * Helper to verify if a process name is a game launcher.
   */
  static isLauncherProcess(processName) {
    if (typeof processName !== 'string') return false;
    const clean = processName.toLowerCase().trim();
    const withExe = clean.endsWith('.exe') ? clean : `${clean}.exe`;
    return LAUNCHER_PROCESSES.has(clean) || LAUNCHER_PROCESSES.has(withExe);
  }

  /**
   * Fetches detailed running processes list for UI checklist.
   */
  static async getDetailedProcesses() {
    return await AppScanner.getRunningProcesses();
  }

  /**
   * Legacy API kept as a no-op so older settings cannot enable sweeping.
   */
  static async smartSweepProcesses() {
    // A denylist cannot safely identify every driver, service or security process.
    return { killed: [], failed: [], closedApps: [] };
  }

  static async setProcessHighPriority() {
    return false;
  }

  static async pauseNonEssentialServices() {
    return false;
  }

  static async restoreNonEssentialServices() {
    return false;
  }

  static async trimWorkingSets() {
    // System-wide trimming can cause paging stalls, including in the active game.
    return {
      success: false, disabled: true, freedMb: 0, freedGb: '0.00',
      message: 'Sistem genelinde RAM boşaltma güvenlik nedeniyle devre dışı. Windows belleği otomatik yönetir.'
    };
  }

  static normalizeProcessName(value) {
    if (typeof value !== 'string') return null;
    const name = value.trim().toLowerCase();
    // Accept executable names only: no paths, wildcards or shell syntax.
    if (!/^[a-z0-9][a-z0-9 ._-]*$/.test(name)) return null;
    return name.endsWith('.exe') ? name : `${name}.exe`;
  }

  static isCloseableProcess(value) {
    const name = this.normalizeProcessName(value);
    return CLOSEABLE_USER_APPS.has(name) &&
      !CORE_WINDOWS_SYSTEM_PROCESSES.has(name) && !this.isLauncherProcess(name);
  }

  /** Close selected desktop apps in this session; never terminate a process tree.
   * Tray apps have an explicit exit policy. NVIDIA interfaces remain window-close only.
   */
  static async killProcesses(processNames, protectedApps = [], { forceTrayApps = true, allowedPaths = null } = {}) {
    const killed = [], failed = [], closedApps = [], skipped = [], details = [];
    const protectedSet = new Set(
      (Array.isArray(protectedApps) ? protectedApps : []).map(p => this.normalizeProcessName(p))
    );
    const requested = new Set(
      (Array.isArray(processNames) ? processNames : []).map(p => this.normalizeProcessName(p))
    );
    const targets = [...requested];
    if (requested.has('overwolf.exe')) {
      // Known components of this selected app only; never use process-tree killing.
      for (const helper of ['overwolfbrowser.exe', 'overwolfhelper.exe', 'overwolflauncher.exe']) {
        if (!requested.has(helper)) targets.push(helper);
      }
    }
    for (const name of targets) {
      if (!name || !this.isCloseableProcess(name) || protectedSet.has(name)) {
        skipped.push(name);
        details.push({ name, outcome: 'skipped', reason: protectedSet.has(name) ? 'protected' : 'unsupported' });
        continue;
      }
      if (process.platform !== 'win32') {
        skipped.push(name);
        continue;
      }
      const forceAllowed = forceTrayApps && TRAY_EXIT_APPS.has(name);
      const psScript = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8;
$ErrorActionPreference = 'Stop';
$sessionId = (Get-Process -Id $PID).SessionId;
$results = @();
$shutdownPaths = @{};
foreach ($p in @(Get-Process -Name '${name.slice(0, -4)}' -ErrorAction SilentlyContinue)) {
  try {
    if ($p.SessionId -ne $sessionId -or $p.SessionId -eq 0) { continue }
    $exePath = $p.Path;
    ${Array.isArray(allowedPaths) ? `if (@(${allowedPaths.map(p => "'" + p.replace(/'/g,"''") + "'").join(',')}) -inotcontains $exePath) { continue }` : ''}
    if (-not $exePath -or $exePath.StartsWith($env:windir + '\\', [System.StringComparison]::OrdinalIgnoreCase)) { continue }
    if ([System.IO.Path]::GetFileName($exePath) -ine '${name}') { continue }
    $startedAt = $p.StartTime.ToUniversalTime().Ticks;
    $closed = $false;
    $method = 'window';
    ${name === 'onedrive.exe' ? `
    if (-not $shutdownPaths.ContainsKey($exePath)) {
      $shutdownPaths[$exePath] = $true;
      $shutdown = Start-Process -FilePath $exePath -ArgumentList '/shutdown' -WindowStyle Hidden -PassThru;
      $shutdown.WaitForExit(3000) | Out-Null;
    }
    $closed = $p.WaitForExit(1500);
    $method = 'shutdown';` : `
    if ($p.MainWindowHandle -ne [IntPtr]::Zero) {
      if ($p.CloseMainWindow()) { $closed = $p.WaitForExit(1500) }
    }`}
    ${forceAllowed ? `
    if (-not $closed) {
      # Recheck PID identity immediately before terminating this selected user app.
      $current = Get-Process -Id $p.Id -ErrorAction SilentlyContinue;
      if ($current -and $current.SessionId -eq $sessionId -and $current.SessionId -ne 0 -and
          $current.Path -ieq $exePath -and $current.StartTime.ToUniversalTime().Ticks -eq $startedAt) {
        $current.Kill();
        $closed = $current.WaitForExit(1500);
        $method = 'selected-tray-process';
      }
    }` : ''}
    $results += [PSCustomObject]@{ name = '${name}'; path = $exePath; closed = $closed; method = $method }
  } catch {
    $results += [PSCustomObject]@{ name = '${name}'; path = $exePath; closed = $false; method = 'error' }
  }
}
ConvertTo-Json -InputObject @($results) -Compress
`;
      try {
        const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
        const { stdout } = await execFileAsync('powershell.exe',
          ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
          { timeout: 15000, windowsHide: true, maxBuffer: 1024 * 1024 });
        const result = JSON.parse(stdout.trim() || '[]');
        const entries = (Array.isArray(result) ? result : [result]).filter(item =>
          item && item.name === name && typeof item.path === 'string' && item.path
        );
        const closed = entries.filter(item => item.closed === true);
        if (closed.length) {
          killed.push(name);
          if (requested.has(name)) closedApps.push({ name, path: closed[0].path });
        }
        if (entries.some(item => item.closed !== true)) failed.push(name);
        if (!entries.length) skipped.push(name);
        details.push({ name, outcome: entries.length ?
          (closed.length === entries.length ? 'closed' : closed.length ? 'partial' : 'failed') : 'not-running-or-inaccessible',
          closedInstances: closed.length, remainingInstances: entries.length - closed.length });
      } catch (err) {
        failed.push(name);
        details.push({ name, outcome: 'failed', reason: err.message });
        console.warn(`[Voldena] Uygulama kapatılamadı (${name}):`, err.message);
      }
    }
    return { killed, failed, closedApps, skipped, details };
  }

  /**
   * Launches a target companion app or URL.
   */
  static isTargetRunning(target, runningProcesses) {
    if (typeof target !== 'string' || !Array.isArray(runningProcesses)) return false;
    const normalizedPath = target.trim().replace(/\\/g, '/').toLowerCase();
    const name = this.normalizeProcessName(path.win32.basename(target.trim()));
    return runningProcesses.some(p => {
      if (!p) return false;
      const runningPath = typeof p.path === 'string' ? p.path.replace(/\\/g, '/').toLowerCase() : '';
      return (runningPath && runningPath === normalizedPath) ||
        (name && this.normalizeProcessName(p.name) === name);
    });
  }

  static async launchTarget(target) {
    if (typeof target !== 'string' || !target.trim()) return false;
    const clean = target.trim();
    const isUrl = /^https?:\/\//i.test(clean);
    let executable = clean;
    try {
      if (!isUrl) {
        // If inspection fails, do not assume that the companion is closed.
        const running = await AppScanner.getRunningProcesses({ throwOnError: true });
        if (!Array.isArray(running)) throw new Error('Süreç listesi doğrulanamadı');
        if (this.isTargetRunning(clean, running)) {
          console.log(`[Voldena] Zaten açık, yeniden başlatılmadı: ${clean}`);
          return false;
        }
        executable = fs.existsSync(clean) ? clean : await AppScanner.resolveExecutablePath(clean);
        if (/\.lnk$/i.test(executable || '')) {
          const literal = executable.replace(/'/g, "''");
          const script = "$s=(New-Object -ComObject WScript.Shell).CreateShortcut('" + literal + "'); $s | Select-Object TargetPath,Arguments,WorkingDirectory | ConvertTo-Json -Compress";
          const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')], {timeout:5000,windowsHide:true});
          const shortcut = JSON.parse(stdout);
          // Arguments may identify a launcher, URL or second program; decline ambiguous shortcuts.
          if (shortcut.Arguments || !/\.exe$/i.test(shortcut.TargetPath || '')) return false;
          executable = shortcut.TargetPath;
        }
        if (executable && this.isTargetRunning(executable, running)) {
          console.log(`[Voldena] Zaten açık, yeniden başlatılmadı: ${executable}`);
          return false;
        }
        if (!executable) executable = this.normalizeProcessName(clean);
        if (!executable || !/\.exe$/i.test(executable)) return false;
      }
      // Encoded command with a literal string: paths never become shell commands.
      const literal = executable.replace(/'/g, "''");
      const script = `$ErrorActionPreference = 'Stop'; Start-Process -FilePath '${literal}'`;
      const encoded = Buffer.from(script, 'utf16le').toString('base64');
      await execFileAsync('powershell.exe',
        ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
        { timeout: 10000, windowsHide: true });
      return true;
    } catch (err) {
      console.warn(`Uygulama başlatılmadı (${clean}):`, err.message);
      return false;
    }
  }

  /** Reopen only apps confirmed closed; also avoid duplicating apps the user reopened. */
  static async relaunchProcesses(closedApps) {
    if (!Array.isArray(closedApps)) return;
    for (const item of closedApps) {
      const target = typeof item === 'string' ? item : item && (item.path || item.name);
      if (target) await this.launchTarget(target);
    }
  }

  /**
   * Legacy API: Explorer termination is disabled.
   */
  static async stopExplorer() {
    return false;
  }

  /**
   * Restores explorer.exe if it was stopped.
   */
  static async startExplorer() {
    try {
      const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq explorer.exe"');
      if (!stdout.includes('explorer.exe')) {
        exec('start explorer.exe');
      }
      return true;
    } catch (err) {
      exec('start explorer.exe');
      return false;
    }
  }

  static _lastCpuInfo = null;

  /**
   * Calculates real-time CPU usage percentage and specs across ticks.
   */
  static getCpuUsageStats() {
    try {
      const cpus = os.cpus();
      let totalIdle = 0;
      let totalTick = 0;

      for (const cpu of cpus) {
        for (const type in cpu.times) {
          totalTick += cpu.times[type];
        }
        totalIdle += cpu.times.idle;
      }

      if (!RamOptimizer._lastCpuInfo) {
        RamOptimizer._lastCpuInfo = { totalIdle, totalTick };
        return {
          percent: null,
          model: cpus[0]?.model ? cpus[0].model.replace(/\s+/g, ' ').trim() : 'Çok Çekirdekli İşlemci',
          cores: cpus.length,
          speedMhz: cpus[0]?.speed || 0
        };
      }

      const idleDelta = totalIdle - RamOptimizer._lastCpuInfo.totalIdle;
      const totalDelta = totalTick - RamOptimizer._lastCpuInfo.totalTick;

      RamOptimizer._lastCpuInfo = { totalIdle, totalTick };

      const usage = totalDelta > 0 ? 100 - Math.round((idleDelta / totalDelta) * 100) : 0;
      const clamped = Math.min(100, Math.max(0, usage));

      return {
        percent: clamped,
        model: cpus[0]?.model ? cpus[0].model.replace(/\s+/g, ' ').trim() : 'Çok Çekirdekli İşlemci',
        cores: cpus.length,
        speedMhz: cpus[0]?.speed || 0
      };
    } catch (e) {
      return { percent: null, model: 'Ölçüm alınamadı', cores: null, speedMhz: null };
    }
  }

  static _lastGpuInfo = {
    percent: 0,
    model: 'Ekran Kartı',
    vramTotalGb: 0,
    vramUsedGb: 0,
    lastChecked: 0
  };

  /**
   * Queries real-time GPU statistics using nvidia-smi or PowerShell WMI.
   */
  static async getGpuUsageStats() {
    const now = Date.now();
    if (now - RamOptimizer._lastGpuInfo.lastChecked < 10000) {
      return RamOptimizer._lastGpuInfo;
    }

    try {
      // 1. Try fast nvidia-smi query
      const { stdout } = await execAsync('nvidia-smi --query-gpu=utilization.gpu,memory.total,memory.used,name --format=csv,noheader,nounits', { timeout: 1200 });
      const line = stdout.trim().split('\n')[0];
      if (line) {
        const parts = line.split(',').map(s => s.trim());
        const util = Math.min(100, Math.max(0, parseInt(parts[0], 10) || 0));
        const totalMb = parseInt(parts[1], 10) || 0;
        const usedMb = parseInt(parts[2], 10) || 0;
        const name = parts[3] || 'NVIDIA GPU';

        RamOptimizer._lastGpuInfo = {
          percent: util,
          model: name,
          vramTotalGb: Number((totalMb / 1024).toFixed(1)),
          vramUsedGb: Number((usedMb / 1024).toFixed(1)),
          lastChecked: now
        };
        return RamOptimizer._lastGpuInfo;
      }
    } catch (e) {
      // Fallback: Query GPU name once if not already known
      if (RamOptimizer._lastGpuInfo.model === 'Ekran Kartı') {
        try {
          const { stdout } = await execAsync('powershell -NoProfile -Command "(Get-CimInstance Win32_VideoController | Select-Object -First 1).Name"', { timeout: 3000 });
          const gpuName = stdout.trim();
          if (gpuName) {
            RamOptimizer._lastGpuInfo.model = gpuName;
          }
        } catch (e2) {}
      }
    }

    RamOptimizer._lastGpuInfo.lastChecked = now;
    return RamOptimizer._lastGpuInfo;
  }

  /**
   * Combined Hardware Stats (RAM + CPU + GPU)
   */
  static async getSystemHardwareStats() {
    const mem = this.getSystemMemoryStats();
    const cpu = this.getCpuUsageStats();
    let gpu = { percent: 0, model: 'Ekran Kartı', vramTotalGb: 0, vramUsedGb: 0 };
    try {
      gpu = await this.getGpuUsageStats();
    } catch (e) {}

    return {
      ...mem,
      cpuPercent: cpu.percent,
      cpuModel: cpu.model,
      cpuCores: cpu.cores,
      gpuPercent: gpu.percent,
      gpuModel: gpu.model,
      gpuVramTotalGb: gpu.vramTotalGb,
      gpuVramUsedGb: gpu.vramUsedGb
    };
  }

  static async boostComputerNow() { return this.trimWorkingSets(); }

  /**
   * Gets exact system memory stats using Node.js native os module.
   */
  static getSystemMemoryStats() {
    try {
      const totalBytes = os.totalmem();
      const freeBytes = os.freemem();
      const usedBytes = totalBytes - freeBytes;

      const totalMb = totalBytes / (1024 * 1024);
      const freeMb = freeBytes / (1024 * 1024);
      const usedMb = usedBytes / (1024 * 1024);

      const percent = Number(((usedBytes / totalBytes) * 100).toFixed(1));

      return {
        total: Number(totalMb.toFixed(1)),
        free: Number(freeMb.toFixed(1)),
        used: Number(usedMb.toFixed(1)),
        percent: percent
      };
    } catch (err) {
      return { total: null, free: null, used: null, percent: null, error: err.message };
    }
  }
}

module.exports = RamOptimizer;
