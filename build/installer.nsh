!macro customInstall
  ; An old per-user shortcut can coexist with the all-users one in Windows Search.
  ; Keep only the installer's current scope for these two product shortcuts.
  ${if} $installMode == "all"
    SetShellVarContext current
    Delete "$SMPROGRAMS\Voldena Oyun Hizlandiricisi.lnk"
    Delete "$SMPROGRAMS\Voldena - Hızlandır ve Kapat.lnk"
    SetShellVarContext all
  ${endif}
  ; Retire only this app's legacy elevated task; the app migrates an enabled preference to Run.
  nsExec::ExecToStack '"$SYSDIR\schtasks.exe" /Delete /TN "VoldenaGameBooster" /F'
  Pop $0
  Pop $1
  CreateShortCut "$DESKTOP\Voldena - Hızlandır ve Kapat.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "--quick-boost" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0
  CreateShortCut "$SMPROGRAMS\Voldena - Hızlandır ve Kapat.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "--quick-boost" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0
!macroend

!macro customUnInstall
  Delete "$DESKTOP\Voldena - Hızlandır ve Kapat.lnk"
  Delete "$SMPROGRAMS\Voldena - Hızlandır ve Kapat.lnk"
!macroend
