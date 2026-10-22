const { exec } = require('child_process');
const util = require('util');
const path = require('path');
const fs = require('fs');
const execPromise = util.promisify(exec);
const execAsync = (command, options = {}) => execPromise(command, { windowsHide: true, timeout: 12000, ...options });

// Pre-curated Popular Gaming & Productivity Apps Catalogue
const POPULAR_APPS = [
  // Communication & Chat
  { name: 'Discord', exe: 'Discord.exe', category: 'İletişim & Chat', icon: 'fa-brands fa-discord' },
  { name: 'Discord PTB', exe: 'DiscordPTB.exe', category: 'İletişim & Chat', icon: 'fa-brands fa-discord' },
  { name: 'Discord Canary', exe: 'DiscordCanary.exe', category: 'İletişim & Chat', icon: 'fa-brands fa-discord' },
  { name: 'Telegram Desktop', exe: 'Telegram.exe', category: 'İletişim & Chat', icon: 'fa-brands fa-telegram' },
  { name: 'WhatsApp', exe: 'WhatsApp.exe', category: 'İletişim & Chat', icon: 'fa-brands fa-whatsapp' },
  { name: 'Skype', exe: 'Skype.exe', category: 'İletişim & Chat', icon: 'fa-brands fa-skype' },

  // Web Browsers
  { name: 'Google Chrome', exe: 'chrome.exe', category: 'Web Tarayıcı', icon: 'fa-brands fa-chrome' },
  { name: 'Microsoft Edge', exe: 'msedge.exe', category: 'Web Tarayıcı', icon: 'fa-brands fa-edge' },
  { name: 'Opera GX', exe: 'opera.exe', category: 'Web Tarayıcı', icon: 'fa-brands fa-opera' },
  { name: 'Brave Browser', exe: 'brave.exe', category: 'Web Tarayıcı', icon: 'fa-solid fa-globe' },
  { name: 'Mozilla Firefox', exe: 'firefox.exe', category: 'Web Tarayıcı', icon: 'fa-brands fa-firefox-browser' },

  // Media & Music
  { name: 'Spotify', exe: 'Spotify.exe', category: 'Müzik & Medya', icon: 'fa-brands fa-spotify' },
  { name: 'VLC Media Player', exe: 'vlc.exe', category: 'Müzik & Medya', icon: 'fa-solid fa-play' },

  // Game Launchers & Platforms
  { name: 'Steam', exe: 'steam.exe', category: 'Oyun Platformu', icon: 'fa-brands fa-steam' },
  { name: 'Epic Games Launcher', exe: 'EpicGamesLauncher.exe', category: 'Oyun Platformu', icon: 'fa-solid fa-gamepad' },
  { name: 'EA App', exe: 'EADesktop.exe', category: 'Oyun Platformu', icon: 'fa-solid fa-gamepad' },
  { name: 'Battle.net', exe: 'Battle.net.exe', category: 'Oyun Platformu', icon: 'fa-brands fa-battle-net' },
  { name: 'Ubisoft Connect', exe: 'upc.exe', category: 'Oyun Platformu', icon: 'fa-solid fa-gamepad' },
  { name: 'Riot Client', exe: 'RiotClientServices.exe', category: 'Oyun Platformu', icon: 'fa-solid fa-gamepad' },

  // Streaming & Recording & Hardware Software
  { name: 'OBS Studio', exe: 'obs64.exe', category: 'Yayın & Kayıt', icon: 'fa-solid fa-video' },
  { name: 'Streamlabs OBS', exe: 'Streamlabs OBS.exe', category: 'Yayın & Kayıt', icon: 'fa-solid fa-video' },
  { name: 'MSI Afterburner', exe: 'MSIAfterburner.exe', category: 'Donanım & Araçlar', icon: 'fa-solid fa-microchip' },
  { name: 'Logitech G HUB', exe: 'lghub.exe', category: 'Donanım & Araçlar', icon: 'fa-solid fa-keyboard' },
  { name: 'Razer Synapse', exe: 'Razer Synapse 3.exe', category: 'Donanım & Araçlar', icon: 'fa-solid fa-keyboard' },
  { name: 'Corsair iCUE', exe: 'iCUE.exe', category: 'Donanım & Araçlar', icon: 'fa-solid fa-fan' },

  // Popular Games
  { name: 'Valorant', exe: 'VALORANT-Win64-Shipping.exe', category: 'Popüler Oyun', icon: 'fa-solid fa-crosshairs' },
  { name: 'Counter-Strike 2 (CS2)', exe: 'cs2.exe', category: 'Popüler Oyun', icon: 'fa-solid fa-gun' },
  { name: 'League of Legends', exe: 'LeagueClientUx.exe', category: 'Popüler Oyun', icon: 'fa-solid fa-shield-halved' },
  { name: 'Grand Theft Auto V (GTA 5)', exe: 'GTA5.exe', category: 'Popüler Oyun', icon: 'fa-solid fa-car' },
  { name: 'Fortnite', exe: 'FortniteClient-Win64-Shipping.exe', category: 'Popüler Oyun', icon: 'fa-solid fa-person-rifle' },
  { name: 'Apex Legends', exe: 'r5apex.exe', category: 'Popüler Oyun', icon: 'fa-solid fa-crosshairs' },
  { name: 'Minecraft', exe: 'Minecraft.exe', category: 'Popüler Oyun', icon: 'fa-solid fa-cube' },
  { name: 'Roblox', exe: 'RobloxPlayerBeta.exe', category: 'Popüler Oyun', icon: 'fa-solid fa-shapes' },
  { name: 'Rust', exe: 'RustClient.exe', category: 'Popüler Oyun', icon: 'fa-solid fa-fire' },
  { name: 'PUBG: Battlegrounds', exe: 'TslGame.exe', category: 'Popüler Oyun', icon: 'fa-solid fa-parachute-box' },
  { name: 'Cyberpunk 2077', exe: 'Cyberpunk2077.exe', category: 'Popüler Oyun', icon: 'fa-solid fa-robot' },
  { name: 'EA SPORTS FC 24 / 25', exe: 'FC24.exe', category: 'Popüler Oyun', icon: 'fa-solid fa-futbol' }
];

// Critical System & Security Processes (RED BADGE - Cannot be killed, PC crash or AV security)
const CRITICAL_PROCESSES = new Set([
  'memory compression.exe', 'memory compression', 'system', 'idle', 'registry',
  'csrss.exe', 'smss.exe', 'wininit.exe', 'services.exe', 'lsass.exe', 'svchost.exe',
  'winlogon.exe', 'dwm.exe', 'fontdrvhost.exe', 'securityhealthservice.exe',
  'smartscreen.exe', 'ekrn.exe', 'antigravity ide.exe', 'antigravity ide', 'antigravity.exe', 'antigravity',
  'voldena.exe', 'node.exe', 'electron.exe', 'tasklist.exe', 'powershell.exe', 'cmd.exe', 'ntoskrnl.exe', 'code.exe', 'cursor.exe'
]);

// Warning Processes (YELLOW BADGE - Windows Shell/Audio/Search/Broker components)
const WARNING_PROCESSES = new Set([
  'explorer.exe', 'audiodg.exe', 'spoolsv.exe', 'ctfmon.exe', 'shellexperiencehost.exe',
  'startmenuexperiencehost.exe', 'searchapp.exe', 'searchindexer.exe', 'searchhost.exe',
  'sihost.exe', 'taskhostw.exe', 'runtimebroker.exe', 'dllhost.exe', 'conhost.exe',
  'language_server_windows_x64.exe', 'wmiprvse.exe', 'wuauserv.exe', 'msedgewebview2.exe'
]);

class AppScanner {
  constructor() {
    this.installedCache = null;
    this.installedCacheTime = 0;
    this.resolvedPathCache = new Map();
  }

  getPopularApps() {
    return POPULAR_APPS;
  }

  /**
   * Fetches currently running processes with PID, memory (MB), and executable path.
   * Categorizes each process into 'critical', 'warning', or 'safe'.
   */
  async getRunningProcesses({ throwOnError = true, currentSessionOnly = false } = {}) {
    const psScript = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8;
$ErrorActionPreference = 'SilentlyContinue';

$currentSession = (Get-Process -Id $PID).SessionId
Get-Process | Where-Object { $_.Id -gt 4 ${currentSessionOnly ? '-and $_.SessionId -eq $currentSession' : ''} } | ForEach-Object {
    $pPath = ''
    try { $pPath = $_.Path } catch {}
    $wTitle = ''
    try { $wTitle = $_.MainWindowTitle } catch {}
    [PSCustomObject]@{
        name = $_.Name + '.exe'
        rawName = $_.Name
        startedAt = $_.StartTime.ToUniversalTime().Ticks.ToString()
        pid = $_.Id
        memoryMb = [math]::Round($_.WorkingSet64 / 1MB, 1)
        path = $pPath
        title = $wTitle
    }
} | ConvertTo-Json -Depth 2 -Compress
`;

    try {
      const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
      const { stdout } = await execAsync(`powershell -NoProfile -EncodedCommand ${encoded}`, { maxBuffer: 15 * 1024 * 1024 });
      if (!stdout.trim()) return [];
      const parsed = JSON.parse(stdout);
      const list = Array.isArray(parsed) ? parsed : [parsed];

      // Cache paths of running processes & classify dangerLevel
      return list
        .filter(p => p.name && p.name.toLowerCase() !== 'idle.exe')
        .map(p => {
          const lowerName = p.name.toLowerCase();
          const lowerRaw = (p.rawName || '').toLowerCase();

          if (p.path && p.name) {
            this.resolvedPathCache.set(lowerName, p.path);
            this.resolvedPathCache.set(lowerRaw, p.path);
          }

          let dangerLevel = 'safe';
          let dangerNote = 'Kullanıcı Uygulaması (Kapatılabilir)';

          if (CRITICAL_PROCESSES.has(lowerName) || CRITICAL_PROCESSES.has(lowerRaw)) {
            dangerLevel = 'critical';
            dangerNote = 'Kritik Sistem / Güvenlik (Kapatılamaz - PC Çöker)';
          } else if (WARNING_PROCESSES.has(lowerName) || WARNING_PROCESSES.has(lowerRaw)) {
            dangerLevel = 'warning';
            dangerNote = 'Sistem Bileşeni (Kapatılması Sorun Yaratabilir)';
          }

          return {
            ...p,
            dangerLevel,
            dangerNote
          };
        })
        .sort((a, b) => {
          // Sort safe processes with high memory first, then warning, then critical
          const order = { safe: 0, warning: 1, critical: 2 };
          if (order[a.dangerLevel] !== order[b.dangerLevel]) {
            return order[a.dangerLevel] - order[b.dangerLevel];
          }
          return b.memoryMb - a.memoryMb;
        });
    } catch (err) {
      console.error('Süreçler alınırken hata:', err.message);
      if (throwOnError) throw err;
      return [];
    }
  }

  /**
   * Scans installed software and Start Menu shortcuts.
   */
  async getInstalledApps(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && this.installedCache && (now - this.installedCacheTime < 60000)) {
      return this.installedCache;
    }

    const psScript = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8;
$ErrorActionPreference = 'SilentlyContinue';

$apps = [System.Collections.Generic.List[PSCustomObject]]::new()
$seen = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)

# 1. Registry Uninstall Keys
$regKeys = @(
  'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
)

foreach ($rk in $regKeys) {
  Get-ItemProperty $rk | Where-Object { $_.DisplayName -and -not $_.SystemComponent } | ForEach-Object {
    $dispName = $_.DisplayName.Trim()
    if ($dispName -and -not $seen.Contains($dispName)) {
      $icon = ''
      if ($_.DisplayIcon) {
        $icon = ($_.DisplayIcon -split ',')[0].Trim(' "')
      }
      $exeName = ''
      if ($icon -and $icon.EndsWith('.exe', [System.StringComparison]::OrdinalIgnoreCase)) {
        $exeName = [System.IO.Path]::GetFileName($icon)
      }
      $seen.Add($dispName) | Out-Null
      $apps.Add([PSCustomObject]@{
        name = $dispName
        exe = $exeName
        path = $icon
        publisher = if ($_.Publisher) { $_.Publisher } else { '' }
      })
    }
  }
}

# 2. Start Menu Shortcuts (.lnk)
$startDirs = @(
  "$env:ProgramData\\Microsoft\\Windows\\Start Menu\\Programs",
  "$env:AppData\\Microsoft\\Windows\\Start Menu\\Programs"
)

$wscript = New-Object -ComObject WScript.Shell
foreach ($dir in $startDirs) {
  if (Test-Path $dir) {
    Get-ChildItem -Path $dir -Filter "*.lnk" -Recurse | ForEach-Object {
      try {
        $sc = $wscript.CreateShortcut($_.FullName)
        $target = $sc.TargetPath
        if ($target -and $target.EndsWith('.exe', [System.StringComparison]::OrdinalIgnoreCase) -and (Test-Path $target)) {
          $baseName = $_.BaseName
          if (-not $seen.Contains($baseName)) {
            $seen.Add($baseName) | Out-Null
            $apps.Add([PSCustomObject]@{
              name = $baseName
              exe = [System.IO.Path]::GetFileName($target)
              path = $target
              publisher = ''
            })
          }
        }
      } catch {}
    }
  }
}

$apps | ConvertTo-Json -Depth 2 -Compress
`;

    try {
      const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
      const { stdout } = await execAsync(`powershell -NoProfile -EncodedCommand ${encoded}`, { maxBuffer: 15 * 1024 * 1024 });
      const parsed = JSON.parse(stdout || '[]');
      const list = (Array.isArray(parsed) ? parsed : [parsed])
        .filter(a => a && a.name && !a.name.toLowerCase().includes('sürücü paketi') && !a.name.toLowerCase().includes('uninstall'))
        .sort((a, b) => a.name.localeCompare(b.name, 'tr'));

      list.forEach(a => {
        if (a.exe && a.path) {
          this.resolvedPathCache.set(a.exe.toLowerCase(), a.path);
        }
      });

      this.installedCache = list;
      this.installedCacheTime = now;
      return list;
    } catch (err) {
      console.error('Yüklü uygulamalar alınamadı:', err.message);
      return [];
    }
  }

  /**
   * Scans and caches Start Menu shortcuts (.lnk files) from user and system directories.
   */
  getStartMenuShortcuts() {
    const now = Date.now();
    if (this.startMenuCache && (now - this.startMenuCacheTime < 60000)) {
      return this.startMenuCache;
    }

    const shortcutMap = new Map();
    const dirs = [
      path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
      path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs')
    ];

    const walk = (currentDir) => {
      try {
        if (!fs.existsSync(currentDir)) return;
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry.name);
          if (entry.isDirectory()) {
            walk(fullPath);
          } else if (entry.name.toLowerCase().endsWith('.lnk')) {
            const rawBase = entry.name.slice(0, -4).toLowerCase();
            const cleanBase = rawBase.replace(/[\s\-_]/g, '');
            shortcutMap.set(entry.name.toLowerCase(), fullPath);
            shortcutMap.set(rawBase, fullPath);
            shortcutMap.set(cleanBase, fullPath);
          }
        }
      } catch (e) {}
    };

    dirs.forEach(walk);
    this.startMenuCache = shortcutMap;
    this.startMenuCacheTime = now;
    return shortcutMap;
  }

  /**
   * Resolves the full executable file path or .lnk shortcut path for an application name or .exe filename.
   */
  async resolveExecutablePath(nameOrExe) {
    if (typeof nameOrExe !== 'string' || !nameOrExe.trim()) return null;
    const clean = nameOrExe.trim();
    const cleanLower = clean.toLowerCase();
    const exeName = cleanLower.endsWith('.exe') ? cleanLower : `${cleanLower}.exe`;
    const cleanWithoutExe = cleanLower.replace(/\.exe$/i, '').trim();
    const normalizedName = cleanWithoutExe.replace(/[\s\-_]/g, '');

    // 1. Direct path check (works for .exe, .lnk, .bat, etc.)
    if (fs.existsSync(clean)) {
      return clean;
    }
    if (!/^[\p{L}\p{N} ._-]+$/u.test(clean)) return null;

    // 2. In-Memory Cache check
    if (this.resolvedPathCache.has(cleanLower)) {
      const cached = this.resolvedPathCache.get(cleanLower);
      if (cached && fs.existsSync(cached)) return cached;
    }
    if (this.resolvedPathCache.has(exeName)) {
      const cached = this.resolvedPathCache.get(exeName);
      if (cached && fs.existsSync(cached)) return cached;
    }

    // 3. Start Menu Shortcuts (.lnk) Check (High Priority for apps like Valorant Tracker, Discord, Clownfish)
    const shortcuts = this.getStartMenuShortcuts();
    const shortcutHit = shortcuts.get(cleanLower) ||
                        shortcuts.get(`${cleanWithoutExe}.lnk`) ||
                        shortcuts.get(cleanWithoutExe) ||
                        shortcuts.get(normalizedName);
    if (shortcutHit && fs.existsSync(shortcutHit)) {
      this.resolvedPathCache.set(cleanLower, shortcutHit);
      this.resolvedPathCache.set(exeName, shortcutHit);
      return shortcutHit;
    }

    // 4. Check Installed Apps Cache (or scan if not loaded)
    let installed = this.installedCache;
    if (!installed) {
      installed = await this.getInstalledApps();
    }
    if (installed && Array.isArray(installed)) {
      for (const app of installed) {
        const appNameLower = (app.name || '').toLowerCase();
        const appExeLower = (app.exe || '').toLowerCase();
        const appNorm = appNameLower.replace(/[\s\-_]/g, '');

        if (appNameLower === cleanLower || appNameLower === cleanWithoutExe ||
            appExeLower === exeName || appNorm === normalizedName) {
          if (app.path && fs.existsSync(path.normalize(app.path))) {
            const normalizedPath = path.normalize(app.path);
            this.resolvedPathCache.set(cleanLower, normalizedPath);
            this.resolvedPathCache.set(exeName, normalizedPath);
            return normalizedPath;
          }
        }
      }
    }

    // 5. Common Program Directories & Subdirectories Check
    const localAppData = process.env.LOCALAPPDATA || '';
    const appData = process.env.APPDATA || '';
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

    const directCandidates = [
      path.join(programFiles, exeName),
      path.join(programFilesX86, exeName),
      path.join(localAppData, 'Programs', exeName),
      path.join(appData, exeName),
      path.join(programFiles, cleanWithoutExe, exeName),
      path.join(programFilesX86, cleanWithoutExe, exeName),
      path.join(localAppData, 'Programs', cleanWithoutExe, exeName),
      path.join(appData, cleanWithoutExe, exeName),
      path.join(localAppData, cleanWithoutExe, exeName)
    ];

    for (const cand of directCandidates) {
      if (fs.existsSync(cand)) {
        this.resolvedPathCache.set(cleanLower, cand);
        this.resolvedPathCache.set(exeName, cand);
        return cand;
      }
    }

    // 6. Known common locations for popular gaming & productivity apps
    const knownPaths = [
      // Discord
      path.join(localAppData, 'Discord', 'Update.exe'),
      path.join(localAppData, 'Programs', 'Discord', 'Discord.exe'),
      // Spotify
      path.join(appData, 'Spotify', 'Spotify.exe'),
      // Steam
      path.join(programFilesX86, 'Steam', 'steam.exe'),
      path.join(programFiles, 'Steam', 'steam.exe'),
      // Overwolf
      path.join(programFilesX86, 'Overwolf', 'Overwolf.exe'),
      path.join(programFilesX86, 'Overwolf', 'OverwolfLauncher.exe'),
      // Clownfish
      path.join(programFilesX86, 'ClownfishVoiceChanger', 'ClownfishVoiceChanger.exe'),
      path.join(programFiles, 'ClownfishVoiceChanger', 'ClownfishVoiceChanger.exe'),
      // Epic Games
      path.join(programFilesX86, 'Epic Games', 'Launcher', 'Portal', 'Binaries', 'Win64', 'EpicGamesLauncher.exe'),
      path.join(programFiles, 'Epic Games', 'Launcher', 'Portal', 'Binaries', 'Win64', 'EpicGamesLauncher.exe'),
      // Riot Client & Games
      'G:\\Riot Games\\Riot Client\\RiotClientServices.exe',
      'C:\\Riot Games\\Riot Client\\RiotClientServices.exe',
      // Chrome & Edge & Opera GX
      path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(localAppData, 'Programs', 'Opera GX', 'opera.exe'),
      // Telegram & OBS
      path.join(appData, 'Telegram Desktop', 'Telegram.exe'),
      path.join(programFiles, 'obs-studio', 'bin', '64bit', 'obs64.exe')
    ];

    for (const kp of knownPaths) {
      if ((kp.toLowerCase().endsWith(exeName) || kp.toLowerCase().includes(cleanWithoutExe)) && fs.existsSync(kp)) {
        this.resolvedPathCache.set(cleanLower, kp);
        this.resolvedPathCache.set(exeName, kp);
        return kp;
      }
    }

    // 7. Registry App Paths & where.exe lookup as last resort
    try {
      const psScript = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8;
$ErrorActionPreference = 'SilentlyContinue';
$p = (Get-ItemProperty "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${clean}" -Name '(default)').'(default)'
if (-not $p) {
    $p = (Get-ItemProperty "HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${clean}" -Name '(default)').'(default)'
}
if (-not $p) {
    $p = (where.exe "${clean}" 2>$null | Select-Object -First 1)
}
$p
`;
      const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
      const { stdout } = await execAsync(`powershell -NoProfile -EncodedCommand ${encoded}`);
      const resolved = stdout.trim().replace(/^"|"$/g, '');
      if (resolved && fs.existsSync(resolved)) {
        this.resolvedPathCache.set(cleanLower, resolved);
        this.resolvedPathCache.set(exeName, resolved);
        return resolved;
      }
    } catch (e) {}

    return null;
  }

  /**
   * Combined dataset for Universal App Picker Modal
   */
  async getAllAppsDataset() {
    const [running, installed] = await Promise.all([
      this.getRunningProcesses(),
      this.getInstalledApps()
    ]);

    return {
      popular: this.getPopularApps(),
      installed,
      running
    };
  }
}

module.exports = new AppScanner();
