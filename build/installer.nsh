!macro customInstall
  ; Retire only this app's legacy elevated task; the app migrates an enabled preference to Run.
  nsExec::ExecToStack '"$SYSDIR\schtasks.exe" /Delete /TN "VoldenaGameBooster" /F'
  Pop $0
  Pop $1
!macroend
