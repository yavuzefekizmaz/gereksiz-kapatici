# Voldena 1.4.0

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
