const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const execAsync = (command, options = {}) => execPromise(command, { windowsHide: true, timeout: 12000, ...options });

// Launchers, game clients, anti-cheats, and system apps that must NEVER be detected as games
const IGNORED_LAUNCHERS_AND_PLATFORMS = new Set([
  'riotclientservices.exe', 'riotclient.exe', 'riotclientcrashhandler.exe', 'riotclientux.exe',
  'epicgameslauncher.exe', 'epicwebhelper.exe', 'unrealeditorfortnite.exe',
  'steam.exe', 'steamservice.exe', 'steamwebhelper.exe', 'steamerrorreporter.exe',
  'eadesktop.exe', 'ea background service.exe', 'origin.exe', 'originwebhelperservice.exe', 'eaconnect_x64.exe',
  'battle.net.exe', 'agent.exe', 'battlenet.exe',
  'galaxyclient.exe', 'gog galaxy.exe', 'galaxyclientservice.exe',
  'upc.exe', 'ubisoftconnect.exe', 'uplay.exe', 'uplaywebcore.exe',
  'vgtray.exe', 'vgc.exe',
  'overwolf.exe', 'overwolflauncher.exe', 'overwolfbrowser.exe',
  'voldena.exe', 'voldena oyun hizlandiricisi.exe', 'electron.exe'
]);

// Non-game tools, IDEs, code editors, browsers and system utilities that must NEVER be treated as games
const STRICT_NON_GAME_APPS = new Set([
  'wallpaper64.exe', 'wallpaper32.exe', 'wallpaper.exe', 'winrtutil64.exe', 'winrtutil32.exe',
  'webwallpaper64.exe', 'webwallpaper32.exe', 'wallpaperservice64.exe', 'wallpaperservice32.exe',
  'code.exe', 'code', 'cursor.exe', 'cursor', 'windsurf.exe', 'windsurf',
  'antigravity.exe', 'antigravity ide.exe', 'antigravity ide', 'antigravity',
  'devenv.exe', 'idea64.exe', 'pycharm64.exe', 'webstorm64.exe', 'rider64.exe', 'clion64.exe', 'studio64.exe',
  'notepad.exe', 'notepad++.exe', 'sublime_text.exe',
  'chrome.exe', 'msedge.exe', 'opera.exe', 'operagx.exe', 'firefox.exe', 'brave.exe', 'vivaldi.exe',
  'discord.exe', 'spotify.exe', 'slack.exe', 'telegram.exe', 'whatsapp.exe', 'teams.exe',
  'explorer.exe', 'taskmgr.exe', 'powershell.exe', 'cmd.exe', 'wt.exe', 'conhost.exe',
  'anydesk.exe', 'teamviewer.exe', 'onedrive.exe', 'dropbox.exe',
  'git.exe', 'node.exe', 'python.exe', 'pythonw.exe', 'java.exe', 'javaw.exe', 'bash.exe'
]);

const IGNORED_LAUNCHER_FOLDERS = new Set([
  'riot client', 'metadata', 'launcher', 'epic games', 'steam',
  'ubisoft game launcher', 'ea desktop', 'origin', 'battle.net', 'gog galaxy',
  'directx', 'support', 'installer', '__redist', '_commonredist'
]);

class GameDetector {
  constructor(ruleStore) {
    this.ruleStore = ruleStore;
    this.discoveredGames = [];
    this.gameDirectories = new Set();
    this.gameExecutables = new Set();
    this.lastScanTime = 0;
  }

  /**
   * Discovers all drive roots on Windows (C:\, D:\, E:\ etc.)
   */
  async getDriveRoots() {
    const drives = [];
    const letters = 'CDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    for (const letter of letters) {
      const root = `${letter}:\\`;
      try {
        if (fs.existsSync(root)) {
          drives.push(root);
        }
      } catch (e) {}
    }
    return drives.length > 0 ? drives : ['C:\\'];
  }

  /**
   * Scans Steam libraryfolders.vdf across all standard locations and drives.
   */
  async findSteamLibraries(drives) {
    const steamLibraries = new Set();

    // Check registry for Steam install path
    try {
      const psScript = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8;
$s = (Get-ItemProperty 'HKCU:\\Software\\Valve\\Steam' -ErrorAction SilentlyContinue).SteamPath
if (-not $s) {
    $s = (Get-ItemProperty 'HKLM:\\SOFTWARE\\WOW6432Node\\Valve\\Steam' -ErrorAction SilentlyContinue).InstallPath
}
if (-not $s) {
    $s = (Get-ItemProperty 'HKLM:\\SOFTWARE\\Valve\\Steam' -ErrorAction SilentlyContinue).InstallPath
}
$s
`;
      const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
      const { stdout } = await execAsync(`powershell -NoProfile -EncodedCommand ${encoded}`);
      const steamPath = stdout.trim();
      if (steamPath && fs.existsSync(steamPath)) {
        steamLibraries.add(steamPath);
      }
    } catch (e) {}

    // Check standard locations on all drives
    for (const drive of drives) {
      const candidates = [
        path.join(drive, 'Program Files (x86)', 'Steam'),
        path.join(drive, 'Program Files', 'Steam'),
        path.join(drive, 'Steam'),
        path.join(drive, 'SteamLibrary'),
        path.join(drive, 'Games', 'Steam'),
        path.join(drive, 'Games', 'SteamLibrary'),
        path.join(drive, 'Oyunlar', 'SteamLibrary')
      ];

      for (const c of candidates) {
        if (fs.existsSync(c)) {
          steamLibraries.add(c);
        }
      }
    }

    // Parse libraryfolders.vdf from each discovered Steam installation
    const allFoundLibraries = new Set(steamLibraries);
    for (const sPath of steamLibraries) {
      const vdfPath = path.join(sPath, 'steamapps', 'libraryfolders.vdf');
      if (fs.existsSync(vdfPath)) {
        try {
          const content = fs.readFileSync(vdfPath, 'utf8');
          const regex = /"path"\s+"([^"]+)"/g;
          let match;
          while ((match = regex.exec(content)) !== null) {
            const lib = match[1].replace(/\\\\/g, '\\');
            if (fs.existsSync(lib)) {
              allFoundLibraries.add(lib);
            }
          }
        } catch (e) {}
      }
    }

    return Array.from(allFoundLibraries);
  }

  /**
   * Scans Epic Games manifests (.item files)
   */
  async findEpicGames() {
    const epicGames = [];
    const epicManifestDirs = [
      'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests',
      path.join(process.env.ProgramData || 'C:\\ProgramData', 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests')
    ];

    for (const dir of epicManifestDirs) {
      if (fs.existsSync(dir)) {
        try {
          const files = fs.readdirSync(dir);
          for (const file of files) {
            if (file.endsWith('.item')) {
              try {
                const raw = fs.readFileSync(path.join(dir, file), 'utf8');
                const parsed = JSON.parse(raw);
                if (parsed.DisplayName && parsed.InstallLocation && fs.existsSync(parsed.InstallLocation)) {
                  epicGames.push({
                    name: parsed.DisplayName,
                    platform: 'Epic Games',
                    path: parsed.InstallLocation,
                    exe: parsed.LaunchExecutable || '',
                    category: 'Oyun'
                  });
                }
              } catch (e) {}
            }
          }
        } catch (e) {}
      }
    }

    return epicGames;
  }

  /**
   * Scans Riot Games (Valorant, LoL, etc.)
   */
  async findRiotGames(drives) {
    const riotGames = [];
    const riotPaths = [
      'C:\\Riot Games',
      path.join(process.env.ProgramData || 'C:\\ProgramData', 'Riot Games')
    ];

    for (const drive of drives) {
      riotPaths.push(path.join(drive, 'Riot Games'));
    }

    for (const rp of riotPaths) {
      if (fs.existsSync(rp)) {
        try {
          const items = fs.readdirSync(rp);
          for (const item of items) {
            const itemPath = path.join(rp, item);
            if (fs.statSync(itemPath).isDirectory() && item !== 'Metadata' && item !== 'Riot Client') {
              riotGames.push({
                name: item,
                platform: 'Riot Games',
                path: itemPath,
                exe: item.toLowerCase().includes('valorant') ? 'VALORANT-Win64-Shipping.exe' : (item.toLowerCase().includes('league') ? 'LeagueClientUx.exe' : ''),
                category: 'Oyun'
              });
            }
          }
        } catch (e) {}
      }
    }

    return riotGames;
  }

  /**
   * Scans common game directory names across all drives (XboxGames, Games, Oyunlar, Ubisoft, EA)
   */
  async findCommonGameFolders(drives) {
    const games = [];
    const folderNames = [
      { name: 'XboxGames', platform: 'Xbox App' },
      { name: 'Games', platform: 'Oyunlar' },
      { name: 'Oyunlar', platform: 'Oyunlar' },
      { name: 'GOG Games', platform: 'GOG Galaxy' },
      { name: 'Ubisoft\\Ubisoft Game Launcher\\games', platform: 'Ubisoft' },
      { name: 'EA Games', platform: 'EA App' }
    ];

    for (const drive of drives) {
      for (const fn of folderNames) {
        const targetPath = path.join(drive, fn.name);
        if (fs.existsSync(targetPath)) {
          try {
            const subdirs = fs.readdirSync(targetPath);
            for (const s of subdirs) {
              const sPath = path.join(targetPath, s);
              if (fs.statSync(sPath).isDirectory()) {
                games.push({
                  name: s,
                  platform: fn.platform,
                  path: sPath,
                  exe: '',
                  category: 'Oyun'
                });
              }
            }
          } catch (e) {}
        }
      }
    }

    return games;
  }

  /**
   * Discovers all executable files inside a game directory up to a max depth.
   */
  async findExecutablesInDirectory(dirPath, maxDepth = 2) {
    const exes = [];
    const ignoredNames = new Set([
      'unitycrashhandler.exe', 'unitycrashhandler64.exe', 'unins000.exe', 'uninstall.exe',
      'dxsetup.exe', 'vcredist_x64.exe', 'vcredist_x86.exe', 'vcredist_msvc2017.exe',
      'crashreport.exe', 'crashreporter.exe', 'crashhandler.exe', 'easyanticheat_setup.exe',
      'battleye_launcher.exe', 'epicgameslauncher.exe', 'steamservice.exe', 'steamerrorreporter.exe',
      'installer.exe', 'setup.exe', 'patcher.exe'
    ]);

    const walk = async (currentDir, currentDepth) => {
      if (currentDepth > maxDepth) return;
      try {
        if (!fs.existsSync(currentDir)) return;
        const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry.name);
          if (entry.isFile() && entry.name.toLowerCase().endsWith('.exe')) {
            const lowerName = entry.name.toLowerCase();
            if (!ignoredNames.has(lowerName) && !lowerName.includes('crash') && !lowerName.includes('unins')) {
              exes.push({ name: entry.name, path: fullPath });
            }
          } else if (entry.isDirectory() && currentDepth < maxDepth) {
            const lowerDir = entry.name.toLowerCase();
            // Skip common non-game subdirectories
            if (!lowerDir.startsWith('.') && !['__redist', '_commonredist', 'directx', 'support', 'installer'].includes(lowerDir)) {
              await walk(fullPath, currentDepth + 1);
            }
          }
        }
      } catch (e) {}
    };

    await walk(dirPath, 0);
    return exes;
  }

  /**
   * Comprehensive Game Scan across all libraries and platforms.
   */
  async scanAllGameLibraries() {
    if(this.scanPromise)return this.scanPromise;
    this.scanPromise=this.scanLibraries();
    try{return await this.scanPromise;}finally{this.scanPromise=null;}
  }
  async scanLibraries() {
    console.log('[GameDetector] Tüm diskler ve oyun platformları taranıyor...');
    const drives = await this.getDriveRoots();
    const results = [];
    const seenPaths = new Set();

    // 1. Steam
    const steamLibs = await this.findSteamLibraries(drives);
    for (const lib of steamLibs) {
      const commonPath = path.join(lib, 'steamapps', 'common');
      if (fs.existsSync(commonPath)) {
        try {
          const gameFolders = fs.readdirSync(commonPath);
          for (const folder of gameFolders) {
            const gDir = path.join(commonPath, folder);
            if (fs.statSync(gDir).isDirectory() && !folder.startsWith('Steamworks')) {
              const key = gDir.toLowerCase();
              if (!seenPaths.has(key)) {
                seenPaths.add(key);
                const foundExes = await this.findExecutablesInDirectory(gDir, 2);
                const mainExe = foundExes.length > 0 ? foundExes[0].name : '';
                results.push({
                  name: folder,
                  platform: 'Steam',
                  path: gDir,
                  exe: mainExe,
                  executables: foundExes.map(e => e.name),
                  category: 'Oyun'
                });
              }
            }
          }
        } catch (e) {}
      }
    }

    // 2. Epic Games
    const epicGames = await this.findEpicGames();
    for (const eg of epicGames) {
      const key = eg.path.toLowerCase();
      if (!seenPaths.has(key)) {
        seenPaths.add(key);
        const foundExes = await this.findExecutablesInDirectory(eg.path, 2);
        eg.executables = foundExes.map(e => e.name);
        if (!eg.exe && foundExes.length > 0) eg.exe = foundExes[0].name;
        results.push(eg);
      }
    }

    // 3. Riot Games
    const riotGames = await this.findRiotGames(drives);
    for (const rg of riotGames) {
      const key = rg.path.toLowerCase();
      if (!seenPaths.has(key)) {
        seenPaths.add(key);
        const foundExes = await this.findExecutablesInDirectory(rg.path, 3);
        rg.executables = foundExes.map(e => e.name);
        if (!rg.exe && foundExes.length > 0) rg.exe = foundExes[0].name;
        results.push(rg);
      }
    }

    // 4. Common Directories
    const commonGames = await this.findCommonGameFolders(drives);
    for (const cg of commonGames) {
      const key = cg.path.toLowerCase();
      if (!seenPaths.has(key)) {
        seenPaths.add(key);
        const foundExes = await this.findExecutablesInDirectory(cg.path, 2);
        cg.executables = foundExes.map(e => e.name);
        if (!cg.exe && foundExes.length > 0) cg.exe = foundExes[0].name;
        results.push(cg);
      }
    }

    // 5. Custom User-Added Game Paths from RuleStore
    if (this.ruleStore) {
      const customPaths = this.ruleStore.getCustomGamePaths() || [];
      for (const cp of customPaths) {
        if (cp && fs.existsSync(cp)) {
          const key = cp.toLowerCase();
          if (!seenPaths.has(key)) {
            seenPaths.add(key);
            const isDir = fs.statSync(cp).isDirectory();
            const foundExes = isDir ? await this.findExecutablesInDirectory(cp, 2) : [{ name: path.basename(cp), path: cp }];
            results.push({
              name: path.basename(cp, path.extname(cp)),
              platform: 'Özel / Manuel',
              path: cp,
              exe: isDir ? (foundExes.length > 0 ? foundExes[0].name : '') : path.basename(cp),
              executables: foundExes.map(e => e.name),
              category: 'Oyun'
            });
          }
        }
      }
    }

    // Cache directories and executables
    this.discoveredGames = results.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    this.gameDirectories.clear();
    this.gameExecutables.clear();

    for (const g of this.discoveredGames) {
      if (g.path) {
        this.gameDirectories.add(g.path.toLowerCase());
      }
      if (g.exe) {
        this.gameExecutables.add(g.exe.toLowerCase());
      }
      if (g.executables && Array.isArray(g.executables)) {
        g.executables.forEach(e => {
          if (e) this.gameExecutables.add(e.toLowerCase());
        });
      }
    }

    this.lastScanTime = Date.now();
    console.log(`[GameDetector] Toplam ${this.discoveredGames.length} adet oyun ve ${this.gameExecutables.size} çalıştırılabilir dosya tespit edildi.`);
    return this.discoveredGames;
  }

  /**
   * Returns currently discovered games list (or triggers scan if empty)
   */
  async getDiscoveredGames(forceRefresh = false) {
    if (forceRefresh || !this.lastScanTime) {
      return await this.scanAllGameLibraries();
    }
    return this.discoveredGames;
  }

  /**
   * Adds a custom game file or folder path.
   */
  async addCustomGamePath(targetPath) {
    if (!targetPath || !fs.existsSync(targetPath)) return false;
    if (this.ruleStore) {
      const current = this.ruleStore.getCustomGamePaths() || [];
      if (!current.includes(targetPath)) {
        current.push(targetPath);
        this.ruleStore.updateCustomGamePaths(current);
      }
    }
    await this.scanAllGameLibraries();
    return true;
  }

  /**
   * Removes a custom game path.
   */
  async removeCustomGamePath(targetPath) {
    if (this.ruleStore) {
      const current = this.ruleStore.getCustomGamePaths() || [];
      const updated = current.filter(p => p.toLowerCase() !== targetPath.toLowerCase());
      this.ruleStore.updateCustomGamePaths(updated);
    }
    await this.scanAllGameLibraries();
    return true;
  }

  /**
   * Checks whether a given running process name or executable path belongs to a game.
   */
  isProcessAGame(processName, executablePath = '') {
    if (!processName) return { isGame: false };
    const pNameLower = processName.toLowerCase().trim();
    const pNameWithExe = pNameLower.endsWith('.exe') ? pNameLower : `${pNameLower}.exe`;
    const pNameWithoutExe = pNameLower.replace(/\.exe$/i, '');
    const cleanNormalizedProc = pNameWithoutExe.replace(/[-_.\s]/g, '').toLowerCase();

    // 0. ABSOLUTE FILTER: Non-game utilities, IDEs (VS Code, Cursor, Antigravity), browsers, system tools
    if (
      STRICT_NON_GAME_APPS.has(pNameLower) ||
      STRICT_NON_GAME_APPS.has(pNameWithExe) ||
      STRICT_NON_GAME_APPS.has(pNameWithoutExe) ||
      pNameLower.includes('antigravity') ||
      pNameLower.includes('voldena') ||
      pNameLower === 'code.exe' ||
      pNameLower === 'cursor.exe' ||
      pNameLower === 'windsurf.exe' ||
      pNameLower.startsWith('opera')
    ) {
      return { isGame: false, isTool: true };
    }

    // 1. STRICT FILTER: Never detect game clients, launchers or anti-cheats as games
    if (IGNORED_LAUNCHERS_AND_PLATFORMS.has(pNameLower) || IGNORED_LAUNCHERS_AND_PLATFORMS.has(pNameWithExe)) {
      return { isGame: false, isLauncher: true };
    }

    // 2. Check known game executable names in cache
    if (this.gameExecutables.has(pNameLower) || this.gameExecutables.has(pNameWithExe)) {
      const matched = this.discoveredGames.find(g => {
        if (g.exe && (g.exe.toLowerCase() === pNameLower || g.exe.toLowerCase() === pNameWithExe)) return true;
        if (g.executables && g.executables.some(e => e.toLowerCase() === pNameLower || e.toLowerCase() === pNameWithExe)) return true;
        return false;
      });
      if (matched && !IGNORED_LAUNCHER_FOLDERS.has(matched.name.toLowerCase())) {
        return {
          isGame: true,
          gameName: matched.name,
          platform: matched.platform || 'Otomatik Algılama'
        };
      }
    }

    // 3. Check executable path against discovered game directories
    if (executablePath) {
      const execPathLower = executablePath.toLowerCase();

      // If the executable path contains a client or launcher folder, reject immediately
      for (const lf of IGNORED_LAUNCHER_FOLDERS) {
        if (execPathLower.includes(`\\${lf}\\`) || execPathLower.includes(`/${lf}/`)) {
          return { isGame: false, isLauncher: true };
        }
      }

      for (const g of this.discoveredGames) {
        if (g.path && execPathLower.startsWith(g.path.toLowerCase())) {
          return {
            isGame: true,
            gameName: g.name,
            platform: g.platform
          };
        }
      }

      // Check generic gaming patterns in path
      const gamePathKeywords = [
        '\\steamapps\\common\\',
        '\\epic games\\',
        '\\riot games\\',
        '\\xboxgames\\',
        '\\gog galaxy\\games\\',
        '\\ubisoft game launcher\\games\\'
      ];

      for (const kw of gamePathKeywords) {
        if (execPathLower.includes(kw)) {
          const parts = execPathLower.split(kw)[1]?.split('\\');
          const folderName = parts && parts.length > 0 ? parts[0] : pNameWithoutExe;
          const folderLower = folderName.toLowerCase();

          // Reject if folder is a client / launcher directory
          if (IGNORED_LAUNCHER_FOLDERS.has(folderLower) || folderLower.includes('client') || folderLower.includes('launcher')) {
            continue;
          }

          return {
            isGame: true,
            gameName: folderName,
            platform: 'Oyun Kütüphanesi'
          };
        }
      }
    }

    // 4. Safe Exact Match against discovered games (NO loose substring matching)
    for (const g of this.discoveredGames) {
      if (g.name) {
        const cleanGameName = g.name.replace(/[-_.\s]/g, '').toLowerCase();
        if (IGNORED_LAUNCHER_FOLDERS.has(cleanGameName) || cleanGameName.includes('client') || cleanGameName.includes('launcher')) {
          continue;
        }
        // ONLY exact match to prevent 'code.exe' or short process names matching unrelated game titles
        if (cleanGameName.length >= 3 && cleanNormalizedProc === cleanGameName) {
          return {
            isGame: true,
            gameName: g.name,
            platform: g.platform || 'Otomatik Oyun'
          };
        }
      }
    }

    // 5. Check common game suffixes (Shipping.exe, etc.)
    if (pNameLower.includes('-win64-shipping.exe') || pNameLower.endsWith('-shipping.exe')) {
      const cleanTitle = pNameLower.replace(/-win64-shipping\.exe$/i, '').replace(/-shipping\.exe$/i, '');
      return {
        isGame: true,
        gameName: cleanTitle.toUpperCase(),
        platform: 'Unreal Engine Oyunu'
      };
    }

    // 6. Check popular games catalog
    try {
      const AppScanner = require('./app-scanner');
      const popGames = AppScanner.getPopularApps().filter(a => a.category && a.category.includes('Oyun'));
      for (const pg of popGames) {
        if (pg.exe && (pg.exe.toLowerCase() === pNameLower || pg.exe.toLowerCase() === pNameWithExe)) {
          return {
            isGame: true,
            gameName: pg.name,
            platform: 'Popüler Oyun'
          };
        }
      }
    } catch (e) {}

    return { isGame: false };
  }
}

module.exports = GameDetector;
