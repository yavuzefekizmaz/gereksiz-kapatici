@echo off
title Voldena Oyun Hizlandiricisi
cd /d "%~dp0"
echo ======================================================
echo           VOLDENA OYUN HIZLANDIRICISI
echo ======================================================
echo Uygulama baslatiliyor, lutfen bekleyin...

if exist "node_modules\.bin\electron.cmd" (
    start "" "node_modules\.bin\electron.cmd" .
) else (
    start "" npx electron .
)
exit
