# ⚡ Voldena Game Booster

[🇹🇷 Türkçe sürüm](README.md)

An advanced desktop process manager and optimizer designed to boost PC gaming performance by managing background tasks and RAM.

## ✨ Features

- 🎮 **Game Modes**: Customizable presets for games like Valorant and Counter-Strike 2.
- 🛡️ **System Safety**: System-wide RAM trimming, CPU priority changes, service stopping and Explorer termination are disabled.
- ⚙️ **Normal App Closing**: Request closure of selected supported desktop apps; reopen only those confirmed closed when the game exits. Apps that refuse remain running.
- 🚀 **Companion Apps**: Launch only if the target app is not already running.
- 🛡️ **Protected Apps**: Protect key system tools (VS Code, AnyDesk, OneDrive) from termination.

---

Made with ❤️ by [Efe Kızmaz](https://github.com/yavuzefekizmaz)


## Safety revision

System-wide working-set trimming, CPU priority changes, service stopping, Explorer termination and Smart Sweep are disabled, including with legacy settings. Only explicitly selected supported desktop apps receive a normal close request. Apps that refuse to close remain running. Companion apps are checked before launch, and are skipped if already running. See DUZELTME_NOTLARI.md for validation limits and Windows setup.

## v1.2.2

Voldena exits completely, including its tray icon, after game-start actions finish by default. Automatic restore is off; restart Voldena for the next game session. Explicitly selected OneDrive, AnyDesk and Overwolf processes have a tray-app exit policy with bounded per-process fallback. NVIDIA interfaces receive normal window-close requests only; graphics drivers and NVIDIA Container remain protected. The app picker loads running processes immediately and independently of installed-app scanning. Voldena's own hardware graphics acceleration is disabled.

### v1.2.3 updater fix

The downloaded setup is revalidated before launch. Silent NSIS updates target the running application's installation directory and request an automatic restart. Voldena stays open if the installer cannot start; update diagnostics are stored in `update.log` in the user-data directory. Windows release CI verifies a real installed upgrade and restart. Users still stuck on v1.2.0 need to run the new setup manually once and use its installed shortcut rather than an old portable EXE.
