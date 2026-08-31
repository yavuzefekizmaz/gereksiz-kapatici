const { exec } = require('child_process');
const util = require('util');
const path = require('path');
const fs = require('fs');
const execAsync = util.promisify(exec);

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
  'smartscreen.exe', 'ekrn.exe', 'antigravity ide.exe', 'voldena.exe', 'node.exe',
  'electron.exe', 'tasklist.exe', 'powershell.exe', 'cmd.exe', 'ntoskrnl.exe'
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
  async getRunningProcesses() {
    const psScript = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8;
$ErrorActionPreference = 'SilentlyContinue';

Get-Process | Where-Object { $_.Id -gt 4 } | ForEach-Object {
    $pPath = ''
    try { $pPath = $_.Path } catch {}
    $wTitle = ''
    try { $wTitle = $_.MainWindowTitle } catch {}
    [PSCustomObject]@{
        name = $_.Name + '.exe'
        rawName = $_.Name
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
   * Resolves the full executable file path for an application name or .exe filename.
   */
  async resolveExecutablePath(nameOrExe) {
    if (!nameOrExe) return null;
    const clean = nameOrExe.trim();
    const cleanLower = clean.toLowerCase();
    const exeName = cleanLower.endsWith('.exe') ? cleanLower : `${cleanLower}.exe`;

    // 1. Direct path check
    if (fs.existsSync(clean) && clean.endsWith('.exe')) {
      return clean;
    }

    // 2. Memory Cache check
    if (this.resolvedPathCache.has(exeName)) {
      const cached = this.resolvedPathCache.get(exeName);
      if (cached && fs.existsSync(cached)) return cached;
    }

    // 3. Known common locations for popular apps
    const localAppData = process.env.LOCALAPPDATA || '';
    const appData = process.env.APPDATA || '';
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

    const knownPaths = [
      // Discord
      path.join(localAppData, 'Discord', 'Update.exe'),
      path.join(localAppData, 'Programs', 'Discord', 'Discord.exe'),
      // Spotify
      path.join(appData, 'Spotify', 'Spotify.exe'),
      // Steam
      path.join(programFilesX86, 'Steam', 'steam.exe'),
      path.join(programFiles, 'Steam', 'steam.exe'),
      // Epic Games
      path.join(programFilesX86, 'Epic Games', 'Launcher', 'Portal', 'Binaries', 'Win64', 'EpicGamesLauncher.exe'),
      path.join(programFiles, 'Epic Games', 'Launcher', 'Portal', 'Binaries', 'Win64', 'EpicGamesLauncher.exe'),
      // Chrome
      path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      // Edge
      path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      // Opera GX
      path.join(localAppData, 'Programs', 'Opera GX', 'opera.exe'),
      // Telegram
      path.join(appData, 'Telegram Desktop', 'Telegram.exe'),
      // OBS Studio
      path.join(programFiles, 'obs-studio', 'bin', '64bit', 'obs64.exe')
    ];

    for (const kp of knownPaths) {
      if (kp.toLowerCase().endsWith(exeName) && fs.existsSync(kp)) {
        this.resolvedPathCache.set(exeName, kp);
        return kp;
      }
    }

    // 4. Registry App Paths & where.exe lookup
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
