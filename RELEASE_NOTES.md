# Voldena 1.6.1

- Quick boost now has a separate small list for use without an open game (AnyDesk is the initial suggestion). It never inherits the game bulk list, changes game/Windows priorities or clears all RAM.
- Manual detection queues behind an ordinary process poll instead of exposing a remote-method busy exception; repeated button clicks share one operation.
- Simplifies profile setup into game, during-play, after-play and advanced steps. After-play apps use the same application picker as other lists. Discovered games open profile editing directly, including when no EXE was inferred.
- Adds native EXE artwork with existing blue/gear fallbacks, a complete protection search field and more one-click protection suggestions. Windows components retain gear artwork.
- Redesigns bulk selection, resource thresholds, history rows and custom color controls. Bulk selection initially shows previously configured apps and expands to the complete process inventory; unsupported/system items cannot be selected for closure.
- A single compact in-app exit notice updates its remaining minutes; users can keep the app open without repeated popups. Installed Windows builds also use one tagged desktop notification with data-only minute updates, subject to Windows notification preferences.
- Adds rotating local diagnostics for lifecycle, process changes, requests, per-application outcomes, scans and errors. Settings can copy the log or save logs.txt directly in the app data folder; exports include independent watcher results and strip credential-like fields/URL query strings.
- Temp cleanup is scoped to the selected drive and explores subfolders of approved temporary locations. It includes old temporary log/ETL files and archived error reports, while checking every ancestor against links before deletion. Personal/game/program/shader files remain outside the scope. Large-file scans run once on first entry per scope and retain results until explicit rescan.
- All-user setup removes this product's obsolete per-user Start menu shortcuts to prevent duplicate Windows Search entries. Existing published versions are preserved.

## Previous releases — 1.5.1

- Confirms the independent update-check launcher has finished its handoff before the main application exits. This fixes a Windows startup race that prevented completion reports even when setup succeeded.

- Disk scans now run only from the scan button. Per-drive/size results survive tab changes; concurrent requests share one scan. Cleanup distinguishes an empty result from partial/unreadable scans and reports inspected, recent, unsupported and excluded entries.
- A guided first-run tour visits and highlights the real pages, then asks about hidden login startup, automatic game detection and global restore. It can be restarted from Settings. Login and X-to-tray behavior always remain hidden/background.
- Adds ten themes and custom background, sidebar, titlebar and accent colors. Fixes header/button spacing, settings cards, confirmation controls and modal sizing; protected application cards now use a compact middle size.
- Clicking a discovered game opens its existing profile or prefills a new editable profile. App triggers such as Antigravity use optimization wording and keep close/launch targets separate.
- Main screen reports only completion counts. Detailed close/open/skip reasons live in Settings → Operation Logs, with one-click protection for future sessions. Selected bulk closure has a visible editable application list and never includes drivers, Windows services or protected/game processes.
- Automatic exit now waits three minutes after operations finish. Global restore keeps monitoring active and avoids early restoration when another active profile still needs an app closed.
- Per-profile **launch after game ends** lists use an independent hidden watcher. It survives Voldena's exit, verifies game PID/creation time, starts only the selected EXEs and prevents duplicate launches. The normal quick shortcut can still exit immediately. If handoff fails the main monitor remains as fallback. Wallpaper Engine uses its official stop/play controls rather than forced shutdown.
- Optional CPU/RAM threshold suggestions identify supported, non-protected applications outside the configured list. Nothing is closed without user confirmation; suggestions appear inside the app without stealing fullscreen focus.
- Explorer remains protected by default at every level. Only a fresh explicit confirmation can enable temporary closure. A separate watchdog restores it on game/app completion, main-process exit, manual recovery or a two-hour safety timeout. Ctrl+Alt+R, dashboard and tray recovery remain available. This opt-in feature is separate from routine application closing.
- Updates Electron to supported stable 44.9.3; adds a local-only content policy, blocks external navigation/new windows and restricts native operations to the current main frame. Fixes Windows watchdog launch lifetime. Production dependency audit reported zero known advisories at review time; this is not an independent penetration-test certification or a guarantee against GPU/driver black screens.

The sections below describe retained behavior from earlier releases.

Removes the empty optimization-level dashboard tile. Hardware and disks share the first row, followed by a compact game/session strip showing actual close/open outcomes. CPU is explicitly labeled as whole-PC utilization over a three-second interval. The settings presets remain available.

Restores GPU composition for normal scrolling (optional `--software-rendering` fallback), removes card blur/shadow repaint costs, reduces GPU probes to once per ten seconds and hardware broadcasts to every three seconds. Background game polling no longer enumerates every application's window title or memory usage. Quick boost now waits for an ordinary process poll to finish rather than randomly refusing a shortcut click while polling.

Adds **Voldena – Hızlandır ve Kapat**, a desktop and Start menu shortcut. It runs the same engine with `--quick-boost`: detects an already running game immediately, applies its enabled profile (or the automatic game defaults), records the result and exits completely. It also works when the normal app is already running. No game means no applications are closed. Busy optimization or update operations are not interrupted. This mode does not wait for a new game or the normal 60-second exit timer.

The private `last-quick-boost.json` report includes completed/failed operations and before/after system memory readings. Memory changes are observations, not guaranteed FPS or freed-memory claims. CPU/RAM load reduction comes from closing selected background applications; global memory trimming, game priority changes and service termination remain disabled.

Wallpaper Engine web renderers and service helpers are now also excluded from automatic game detection. Quick mode ignores explicitly configured tool/IDE triggers without modifying those saved profiles. All detected running games remain protected during manual profile execution.

Adds a regression fix so Steam-installed Wallpaper Engine and its WinRT helpers do not trigger automatic game profiles or the game exit countdown. Existing explicitly configured user profiles remain intact.

Recovered the advanced local 1.2.0 interface and connected its real CPU, RAM, GPU and storage panels. Its original source was verified against the preserved local package. Profiles, companion applications, protected applications, disk inspection and GitHub/local/manual update controls remain available.

- Games already running at application startup form a baseline. Only games started after monitoring begins can request automatic exit, 60 seconds after profile operations finish. Disabling the setting, ending the game or beginning an update cancels pending exit.
- Supported selected user applications receive bounded normal exit requests. Tray fallback checks session, executable path, PID and creation time. System, driver, game, anti-cheat and launcher processes remain protected. Broad process sweeping, Explorer termination, service stopping and global working-set trimming stay disabled.
- Running applications load independently of installed-program scans. Companions are checked before launch; ambiguous launcher shortcuts are skipped.
- Cleanup previews individual filenames, paths, reasons and sizes for old .tmp/.temp/.dmp files directly inside user-local Temp/CrashDumps only. Results distinguish deleted and skipped files, show their GB total and measure the disk free-space change separately. Documents, OneDrive, Windows directories, shader caches and Recycle Bin are excluded. Large-file removal uses Recycle Bin after confirmation.
- Startup uses a standard hidden login entry; errors removing legacy elevated tasks are shown. Manual launch remains visible. Setup updates verify metadata and SHA-512 before installer handoff and preserve the target directory; a bounded watchdog records replacement/restart or recovers an aborted update. Portable copies are clearly identified.

This release does not claim verified FPS gains or a definitive fix for every multi-monitor black-screen scenario. Automated process safety and lifecycle tests are separate from real gameplay validation.

Includes a new Voldena mark, bundled icons for offline use and lighter static surfaces. Hardware probing pauses while the window is hidden; game monitoring remains active.
