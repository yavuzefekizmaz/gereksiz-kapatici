$ErrorActionPreference = 'Stop'
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
$installDir = Join-Path $env:RUNNER_TEMP 'Update Integration\Voldena Oyun Hizlandiricisi'
$oldInstaller = Join-Path $env:RUNNER_TEMP 'Voldena-previous-setup.exe'
$exe = Join-Path $installDir 'Voldena Oyun Hizlandiricisi.exe'
$newInstaller = (Resolve-Path "dist/Voldena.Oyun.Hizlandiricisi.Setup.$version.exe").Path
Invoke-WebRequest 'https://github.com/yavuzefekizmaz/gereksiz-kapatici/releases/download/v1.2.2/Voldena.Oyun.Hizlandiricisi.Setup.1.2.2.exe' -OutFile $oldInstaller
$old = Start-Process $oldInstaller -ArgumentList @('/S', "/D=$installDir") -Wait -PassThru
if ($old.ExitCode -ne 0) { throw "Previous setup failed: $($old.ExitCode)" }
if (!(Test-Path $exe)) { throw 'Previous setup did not install to the requested directory' }
if ((Get-Item $exe).VersionInfo.ProductVersion -notlike '1.2.2*') { throw 'Previous version was not installed' }
try {
  Start-Process $exe
  Start-Sleep -Seconds 3
  node scripts/launch-test-update.js $newInstaller $exe
  if ($LASTEXITCODE -ne 0) { throw 'Installer handoff failed' }
  # Simulate app.quit after confirmed startup, only for this isolated test installation.
  Get-Process | Where-Object { $_.Path -eq $exe } | Stop-Process -Force -ErrorAction SilentlyContinue
  $deadline = (Get-Date).AddSeconds(90)
  $verified = $false
  do {
    Start-Sleep -Seconds 2
    $file = Get-Item $exe -ErrorAction SilentlyContinue
    $running = Get-Process | Where-Object { $_.Path -eq $exe }
    if ($file -and $file.VersionInfo.ProductVersion -like "$version*" -and $running) {
      $verified = $true
      break
    }
  } while ((Get-Date) -lt $deadline)
  if (!$verified) { throw 'Update did not replace the old version and automatically restart the installed app' }
  Write-Host "Verified actual Windows update: 1.2.2 -> $version, same directory, automatic restart"
} finally {
  Get-Process | Where-Object { $_.Path -eq $exe } | Stop-Process -Force -ErrorAction SilentlyContinue
}
