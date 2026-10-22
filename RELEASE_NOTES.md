# Voldena 1.3.1

Adds a regression fix so Steam-installed Wallpaper Engine and its WinRT helpers do not trigger automatic game profiles or the game exit countdown. Existing explicitly configured user profiles remain intact.

Recovered the advanced local 1.2.0 interface and connected its real CPU, RAM, GPU and storage panels. Its original source was verified against the preserved local package. Profiles, companion applications, protected applications, disk inspection and GitHub/local/manual update controls remain available.

- Games already running at application startup form a baseline. Only games started after monitoring begins can request automatic exit, 60 seconds after profile operations finish. Disabling the setting, ending the game or beginning an update cancels pending exit.
- Supported selected user applications receive bounded normal exit requests. Tray fallback checks session, executable path, PID and creation time. System, driver, game, anti-cheat and launcher processes remain protected. Broad process sweeping, Explorer termination, service stopping and global working-set trimming stay disabled.
- Running applications load independently of installed-program scans. Companions are checked before launch; ambiguous launcher shortcuts are skipped.
- Cleanup previews individual filenames, paths, reasons and sizes for old .tmp/.temp/.dmp files directly inside user-local Temp/CrashDumps only. Results distinguish deleted and skipped files, show their GB total and measure the disk free-space change separately. Documents, OneDrive, Windows directories, shader caches and Recycle Bin are excluded. Large-file removal uses Recycle Bin after confirmation.
- Startup uses a standard hidden login entry; errors removing legacy elevated tasks are shown. Manual launch remains visible. Setup updates verify metadata and SHA-512 before installer handoff and preserve the target directory; a bounded watchdog records replacement/restart or recovers an aborted update. Portable copies are clearly identified.

This release does not claim verified FPS gains or a definitive fix for every multi-monitor black-screen scenario. Automated process safety and lifecycle tests are separate from real gameplay validation.

Includes a new Voldena mark, bundled icons for offline use and lighter static surfaces. Hardware probing pauses while the window is hidden; game monitoring remains active.
