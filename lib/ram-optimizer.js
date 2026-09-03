const { exec, spawn } = require('child_process');
const util = require('util');
const path = require('path');
const os = require('os');
const fs = require('fs');
const execAsync = util.promisify(exec);
const AppScanner = require('./app-scanner');

// Built-in core Windows system processes that must NEVER be killed
const currentExecutableName = path.basename(process.execPath).toLowerCase();
const CORE_WINDOWS_SYSTEM_PROCESSES = new Set([
  'system', 'idle', 'csrss.exe', 'smss.exe', 'wininit.exe', 'services.exe',
  'lsass.exe', 'svchost.exe', 'fontdrvhost.exe', 'wuauclt.exe', 'spoolsv.exe',
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

// Common user browsers (never kill via smart-sweep unless explicitly targeted in a rule)
const BROWSER_PROCESSES = new Set([
  'opera.exe', 'chrome.exe', 'msedge.exe', 'firefox.exe', 'brave.exe'
]);

class RamOptimizer {
  /**
   * Helper to verify if a process name is a game launcher.
   */
  static isLauncherProcess(processName) {
    if (!processName) return false;
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
   * Smart Sweeper: Kills non-essential background bloatware processes.
   * STRICTLY PROTECTS: Voldena, Launchers, Browsers, Protected Apps, and Active Game.
   */
  static async smartSweepProcesses(protectedApps = [], triggerProcess = '') {
    console.log('[Voldena Smart-Sweeper] Akıllı arka plan temizliği başlatılıyor...');
    const protectedSet = new Set([
      ...Array.from(CORE_WINDOWS_SYSTEM_PROCESSES),
      ...Array.from(LAUNCHER_PROCESSES),
      ...Array.from(BROWSER_PROCESSES),
      ...protectedApps.map(p => p.toLowerCase())
    ]);

    if (triggerProcess) {
      const cleanTrigger = triggerProcess.toLowerCase().trim();
      protectedSet.add(cleanTrigger);
      protectedSet.add(cleanTrigger.endsWith('.exe') ? cleanTrigger : `${cleanTrigger}.exe`);
      protectedSet.add(cleanTrigger.replace(/\.exe$/i, ''));
    }

    try {
      const detailed = await this.getDetailedProcesses();
      const targetsToKill = detailed
        .map(p => p.name)
        .filter(name => {
          if (!name) return false;
          const lower = name.toLowerCase();
          const withExe = lower.endsWith('.exe') ? lower : `${lower}.exe`;
          const withoutExe = lower.replace(/\.exe$/i, '');
          if (lower.includes('voldena')) return false;
          return !protectedSet.has(lower) && !protectedSet.has(withExe) && !protectedSet.has(withoutExe);
        });

      if (targetsToKill.length > 0) {
        const result = await this.killProcesses(targetsToKill, protectedApps);
        console.log(`[Voldena Smart-Sweeper] ${result.killed.length} adet arka plan süreci temizlendi.`);
        return result;
      }
    } catch (err) {
      console.error('Smart Sweep hatası:', err.message);
    }

    return { killed: [], failed: [], closedApps: [] };
  }

  /**
   * Sets High CPU Priority class for active game process to maximize FPS.
   */
  static async setProcessHighPriority(processName) {
    if (!processName) return;
    const cleanName = processName.replace(/\.exe$/i, '').trim();
    const psScript = `
      try {
        $procs = Get-Process -Name "${cleanName}" -ErrorAction SilentlyContinue
        foreach ($p in $procs) {
          $p.PriorityClass = [System.Diagnostics.ProcessPriorityClass]::High
        }
      } catch {}
    `;
    try {
      await execAsync(`powershell -NoProfile -Command "${psScript.replace(/\n/g, ' ')}"`);
      console.log(`[Voldena Engine] ${processName} için CPU önceliği YÜKSEK (HIGH PRIORITY) yapıldı.`);
    } catch (e) {}
  }

  /**
   * Pauses non-essential background Windows services during game mode for maximum FPS.
   */
  static async pauseNonEssentialServices() {
    const services = ['DiagTrack', 'WSearch', 'Spooler'];
    for (const svc of services) {
      try {
        await execAsync(`net stop "${svc}" /y`);
        console.log(`[Voldena Engine] Servis geçici durduruldu: ${svc}`);
      } catch (e) {}
    }
  }

  /**
   * Restores background services when game exits.
   */
  static async restoreNonEssentialServices() {
    const services = ['DiagTrack', 'WSearch', 'Spooler'];
    for (const svc of services) {
      try {
        await execAsync(`net start "${svc}"`);
      } catch (e) {}
    }
  }

  /**
   * Trims working sets of running processes to instantly release RAM to Windows standby pool.
   */
  static async trimWorkingSets() {
    const beforeFreeMb = Number((os.freemem() / (1024 * 1024)).toFixed(1));

    const psScript = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8;
$ErrorActionPreference = 'SilentlyContinue';

$code = @'
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;

public class UltraMemoryCleaner {
    [DllImport("psapi.dll")]
    public static extern int EmptyWorkingSet(IntPtr hwProcess);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool SetProcessWorkingSetSize(IntPtr proc, IntPtr min, IntPtr max);

    public static int TrimAll() {
        int count = 0;
        foreach (Process proc in Process.GetProcesses()) {
            try {
                if (!proc.HasExited && proc.Id > 4) {
                    EmptyWorkingSet(proc.Handle);
                    SetProcessWorkingSetSize(proc.Handle, (IntPtr)(-1), (IntPtr)(-1));
                    count++;
                }
            } catch {}
        }
        return count;
    }
}
'@

try {
    Add-Type -TypeDefinition $code -Language CSharp
} catch {}

$cleaned = [UltraMemoryCleaner]::TrimAll()
Write-Output "Cleaned $cleaned processes"
`;

    try {
      const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
      const { stdout } = await execAsync(`powershell -NoProfile -EncodedCommand ${encoded}`, { timeout: 8000 });
      
      const afterFreeMb = Number((os.freemem() / (1024 * 1024)).toFixed(1));
      const freedMb = Number(Math.max(0, afterFreeMb - beforeFreeMb).toFixed(1));
      const freedGb = (freedMb / 1024).toFixed(2);

      const msg = freedMb >= 1000 
        ? `${freedGb} GB (${freedMb} MB) RAM başarıyla boşaltıldı!` 
        : `${freedMb} MB RAM başarıyla boşaltıldı!`;

      console.log(`[Voldena Engine] ${msg} (${stdout.trim()})`);

      return {
        success: true,
        freedMb,
        freedGb,
        message: msg
      };
    } catch (err) {
      console.error('RAM temizleme hatası:', err.message);
      return { success: false, freedMb: 0, error: err.message };
    }
  }

  /**
   * Forcefully closes a list of specified process names and captures their executable paths for auto-reopening.
   * STRICTLY PROTECTS: Voldena itself, Launchers, and Core System Processes.
   */
  static async killProcesses(processNames, protectedApps = []) {
    const killed = [];
    const failed = [];
    const closedApps = [];
    const protectedSet = new Set(protectedApps.map(p => p.toLowerCase()));
    const currentExe = path.basename(process.execPath).toLowerCase();

    const isProtectedTarget = (name) => {
      if (!name) return true;
      const clean = name.toLowerCase().trim();
      const withExe = clean.endsWith('.exe') ? clean : `${clean}.exe`;
      const withoutExe = clean.replace(/\.exe$/i, '');

      // 1. Never kill Voldena or current application process!
      if (clean === currentExe || withExe === currentExe || withoutExe === currentExe.replace(/\.exe$/i, '')) return true;
      if (clean.includes('voldena')) return true;

      // 2. Never kill core Windows system processes
      if (CORE_WINDOWS_SYSTEM_PROCESSES.has(clean) || CORE_WINDOWS_SYSTEM_PROCESSES.has(withExe) || CORE_WINDOWS_SYSTEM_PROCESSES.has(withoutExe)) return true;

      // 3. Never kill game launchers
      if (LAUNCHER_PROCESSES.has(clean) || LAUNCHER_PROCESSES.has(withExe) || LAUNCHER_PROCESSES.has(withoutExe)) return true;

      // 4. Protected apps list
      if (protectedSet.has(clean) || protectedSet.has(withExe) || protectedSet.has(withoutExe)) return true;

      return false;
    };
    
    // Clean process names
    const validTargets = processNames
      .map(p => p.trim())
      .filter(p => p && !isProtectedTarget(p));

    if (validTargets.length === 0) {
      return { killed, failed, closedApps };
    }

    // Step 1: Pre-resolve executable paths for all targets before killing them
    for (const name of validTargets) {
      const cleanName = name.endsWith('.exe') ? name : `${name}.exe`;
      try {
        const resolvedPath = await AppScanner.resolveExecutablePath(cleanName);
        closedApps.push({
          name: cleanName,
          path: resolvedPath || ''
        });
      } catch (e) {
        closedApps.push({ name: cleanName, path: '' });
      }
    }

    // Step 2: Kill running instances
    for (const cleanName of validTargets) {
      if (isProtectedTarget(cleanName)) continue;
      const exeTarget = cleanName.endsWith('.exe') ? cleanName : `${cleanName}.exe`;
      try {
        await execAsync(`taskkill /F /IM "${exeTarget}" /T`);
        killed.push(exeTarget);
        console.log(`[Voldena Engine] Kapatıldı: ${exeTarget}`);
      } catch (err) {
        // If taskkill fails, it might not have been running or needed name without .exe
        try {
          const rawName = cleanName.replace(/\.exe$/i, '');
          if (isProtectedTarget(rawName)) continue;
          await execAsync(`taskkill /F /IM "${rawName}.exe" /T`);
          killed.push(exeTarget);
        } catch (e2) {
          failed.push(exeTarget);
        }
      }
    }

    return { killed, failed, closedApps };
  }

  /**
   * Launches a target companion app or URL.
   */
  static async launchTarget(target) {
    if (!target || !target.trim()) return;
    const clean = target.trim();

    // 1. If URL, open with default browser
    if (clean.startsWith('http://') || clean.startsWith('https://')) {
      try {
        exec(`start "" "${clean}"`);
        console.log(`[Voldena Engine] URL Açıldı: ${clean}`);
        return true;
      } catch (err) {
        console.error(`URL açılamadı (${clean}):`, err.message);
        return false;
      }
    }

    // 2. If valid file path exists
    if (fs.existsSync(clean)) {
      try {
        const dir = path.dirname(clean);
        exec(`start "" /D "${dir}" "${clean}"`);
        console.log(`[Voldena Engine] Uygulama Başlatıldı (Dosya Yolu): ${clean}`);
        return true;
      } catch (err) {
        console.error(`Dosya başlatılamadı (${clean}):`, err.message);
        return false;
      }
    }

    // 3. Resolve executable path
    try {
      const resolved = await AppScanner.resolveExecutablePath(clean);
      if (resolved && fs.existsSync(resolved)) {
        const dir = path.dirname(resolved);
        exec(`start "" /D "${dir}" "${resolved}"`);
        console.log(`[Voldena Engine] Uygulama Başlatıldı (Çözümlendi): ${resolved}`);
        return true;
      } else {
        // Fallback: try Windows start
        exec(`start "" "${clean}"`);
        console.log(`[Voldena Engine] Uygulama Başlatıldı (Windows Run): ${clean}`);
        return true;
      }
    } catch (err) {
      console.error(`Uygulama başlatılamadı (${clean}):`, err.message);
      return false;
    }
  }

  /**
   * Reopens closed applications when game mode exits.
   */
  static async relaunchProcesses(closedApps) {
    if (!closedApps || closedApps.length === 0) return;
    console.log('[Voldena Engine] Kapatılan uygulamalar yeniden başlatılıyor...');

    for (const item of closedApps) {
      if (!item) continue;
      
      let exePath = '';
      let appName = '';

      if (typeof item === 'string') {
        appName = item;
        exePath = fs.existsSync(item) ? item : '';
      } else if (typeof item === 'object') {
        appName = item.name || '';
        exePath = item.path || '';
      }

      if (!exePath && appName) {
        exePath = await AppScanner.resolveExecutablePath(appName);
      }

      if (exePath && fs.existsSync(exePath)) {
        try {
          const dir = path.dirname(exePath);
          exec(`start "" /D "${dir}" "${exePath}"`);
          console.log(`[Voldena Engine] Geri Açıldı (Dosya Yolu): ${exePath}`);
        } catch (err) {
          console.error(`Yeniden açılamadı (${exePath}):`, err.message);
        }
      } else if (appName) {
        try {
          exec(`start "" "${appName}"`);
          console.log(`[Voldena Engine] Geri Açıldı (Windows Run): ${appName}`);
        } catch (err) {
          console.error(`Yeniden açılamadı (${appName}):`, err.message);
        }
      }
    }
  }

  /**
   * Temporarily stops explorer.exe (High Optimization Mode).
   */
  static async stopExplorer() {
    try {
      await execAsync('taskkill /F /IM explorer.exe');
      return true;
    } catch (err) {
      return false;
    }
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
      return { total: 16384, free: 8192, used: 8192, percent: 50.0 };
    }
  }
}

module.exports = RamOptimizer;
