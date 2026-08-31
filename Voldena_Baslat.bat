@echo off
title Voldena Oyun Hizlandiricisi
cd /d "%~dp0"

:: Yonetici (Administrator) yetki kontrolu
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Yonetici yetkisi isteniyor...
    powershell -NoProfile -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo ======================================================
echo           VOLDENA OYUN HIZLANDIRICISI (ADMIN)
echo ======================================================
echo Uygulama baslatiliyor, lutfen bekleyin...

if exist "node_modules\.bin\electron.cmd" (
    start "" "node_modules\.bin\electron.cmd" .
) else (
    start "" npx electron .
)
exit
