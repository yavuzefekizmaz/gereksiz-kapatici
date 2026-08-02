const { exec } = require('child_process');
const util = require('util');
const os = require('os');
const execAsync = util.promisify(exec);

// Built-in core Windows system processes that must NEVER be killed
const CORE_WINDOWS_SYSTEM_PROCESSES = new Set([
  'system', 'idle', 'csrss.exe', 'smss.exe', 'wininit.exe', 'services.exe',
  'lsass.exe', 'svchost.exe', 'fontdrvhost.exe', 'wuauclt.exe', 'spoolsv.exe',
  'dwm.exe', 'conhost.exe', 'sihost.exe', 'taskhostw.exe', 'explorer.exe',
  'ctfmon.exe', 'shellexperiencehost.exe', 'startmenuexperiencehost.exe',
  'searchapp.exe', 'searchindexer.exe', 'audiodg.exe', 'securityhealthservice.exe',
  'smartscreen.exe', 'voldena.exe', 'electron.exe', 'node.exe'
]);

class RamOptimizer {
  /**
   * Fetches detailed running processes list with RAM usage (in MB) and paths for the Process Checklist Modal.
   */
  static async getDetailedProcesses() {
    const psScript = `
      try {
        $procs = Get-Process | Where-Object { $_.WorkingSet64 -gt 5MB } | Select-Object Name, Id, @{N='MemoryMb';E={[math]::Round($_.WorkingSet64 / 1MB, 1)}}
        $procs | ConvertTo-Json
      } catch {
        "[]"
      }
    `;

    try {
      const { stdout } = await execAsync(`powershell -NoProfile -Command "${psScript.replace(/\n/g, ' ')}"`);
      if (!stdout.trim()) return [];
      const parsed = JSON.parse(stdout);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      
      return list
        .map(p => {
          const exeName = (p.Name ? p.Name : '') + '.exe';
          return {
            name: exeName,
            rawName: p.Name,
            pid: p.Id,
            memoryMb: p.MemoryMb || 0
          };
        })
        .filter(p => p.name && !CORE_WINDOWS_SYSTEM_PROCESSES.has(p.name.toLowerCase()))
        .sort((a, b) => b.memoryMb - a.memoryMb);
    } catch (err) {
      console.error('Detaylı süreçler alınamadı:', err.message);
      return [];
    }
  }

  /**
   * Smart Sweeper: Kills all non-whitelisted user background processes in 1 shot!
   */
  static async smartSweepProcesses(protectedApps = [], triggerProcess = '') {
    console.log('[Ultra Smart-Sweeper] Akıllı arka plan temizliği başlatılıyor...');
    const protectedSet = new Set([
      ...Array.from(CORE_WINDOWS_SYSTEM_PROCESSES),
      ...protectedApps.map(p => p.toLowerCase())
    ]);

    if (triggerProcess) {
      protectedSet.add(triggerProcess.toLowerCase());
    }

    const killed = [];
    const killedPaths = [];

    try {
      const detailed = await this.getDetailedProcesses();
      const targetsToKill = detailed
        .map(p => p.name)
        .filter(name => !protectedSet.has(name.toLowerCase()));

      if (targetsToKill.length > 0) {
        const result = await this.killProcesses(targetsToKill, protectedApps);
        console.log(`[Ultra Smart-Sweeper] ${result.killed.length} adet arka plan süreci temizlendi.`);
        return result;
      }
    } catch (err) {
      console.error('Smart Sweep hatası:', err.message);
    }

    return { killed, killedPaths };
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
      console.log(`[Ultra Optimizer] ${processName} için CPU önceliği YÜKSEK (HIGH PRIORITY) yapıldı.`);
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
        console.log(`[Ultra Optimizer] Gereksiz servis geçici durduruldu: ${svc}`);
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
    const psScript = `
      $code = @"
      using System;
      using System.Runtime.InteropServices;
      public class MemoryCleaner {
          [DllImport("psapi.dll")]
          public static extern int EmptyWorkingSet(IntPtr hwProcess);

          public static void TrimAll() {
              foreach (var proc in System.Diagnostics.Process.GetProcesses()) {
                  try {
                      if (!proc.HasExited && proc.Id > 4) {
                          EmptyWorkingSet(proc.Handle);
                      }
                  } catch {}
              }
          }
      }
"@
      Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue
      [MemoryCleaner]::TrimAll()
      [System.GC]::Collect()
    `;

    try {
      const command = `powershell -NoProfile -ExecutionPolicy Bypass -Command "${psScript.replace(/\n/g, ' ')}"`;
      await execAsync(command, { timeout: 10000 });
      return { success: true, message: 'RAM çalışma kümesi başarıyla temizlendi.' };
    } catch (err) {
      try {
        await execAsync('powershell -NoProfile -Command "[System.GC]::Collect()"');
        return { success: true, message: 'RAM genel temizlik yapıldı.' };
      } catch (fallbackErr) {
        return { success: false, error: fallbackErr.message };
      }
    }
  }

  /**
   * Fetches full executable paths of running target processes before killing them.
   */
  static async getExecutablePaths(processNames) {
    if (!processNames || processNames.length === 0) return [];
    
    const filter = processNames.map(p => `Name='${p.trim()}'`).join(' OR ');
    const psScript = `
      try {
        $procs = Get-CimInstance Win32_Process -Filter "${filter}"
        $paths = $procs | Where-Object { $_.ExecutablePath } | Select-Object -ExpandProperty ExecutablePath -Unique
        $paths | ConvertTo-Json
      } catch {
        "[]"
      }
    `;

    try {
      const { stdout } = await execAsync(`powershell -NoProfile -Command "${psScript.replace(/\n/g, ' ')}"`);
      if (!stdout.trim()) return [];
      const parsed = JSON.parse(stdout);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (err) {
      console.error('Executable yolları alınamadı:', err.message);
      return [];
    }
  }

  /**
   * Forcefully closes a list of specified process names and returns their saved file paths for auto-reopening.
   */
  static async killProcesses(processNames, protectedApps = []) {
    const killed = [];
    const failed = [];
    const protectedSet = new Set(protectedApps.map(p => p.toLowerCase()));
    const validTargets = processNames.map(p => p.trim()).filter(p => p && !protectedSet.has(p.toLowerCase()));

    const killedPaths = await this.getExecutablePaths(validTargets);

    for (const cleanName of validTargets) {
      try {
        await execAsync(`taskkill /F /IM "${cleanName}" /T`);
        killed.push(cleanName);
      } catch (err) {
        failed.push(cleanName);
      }
    }

    return { killed, failed, killedPaths };
  }

  /**
   * Reopens applications using their executable file paths.
   */
  static async relaunchProcesses(exePaths) {
    if (!exePaths || exePaths.length === 0) return;
    console.log('[RamOptimizer] Kapatılan uygulamalar yeniden başlatılıyor:', exePaths);

    for (const exePath of exePaths) {
      if (!exePath) continue;
      try {
        exec(`start "" "${exePath}"`);
      } catch (err) {
        console.error(`Uygulama yeniden başlatılamadı (${exePath}):`, err.message);
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
      return { total: 24576, free: 12288, 12288: 12288, percent: 50.0 };
    }
  }
}

module.exports = RamOptimizer;
