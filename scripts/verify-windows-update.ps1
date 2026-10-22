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
$userData = Join-Path $env:APPDATA 'voldena'
New-Item -ItemType Directory -Path $userData -Force | Out-Null
$configPath = Join-Path $userData 'voldena_config.json'
$profile = @{settings=@{autoGameDetection=$false;exitAfterOptimization=$false;autoStartOnBoot=$false};rules=@(@{id='preserved-profile';name='Preserve me';triggerProcess='VoldenaTestGame.exe';enabled=$false;closeTargets=@();launchTargets=@()});protectedApps=@('keep.exe');customGamePaths=@();verifiedGames=@();customFutureValue='preserve-unknown-field'}
$profile | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $configPath -Encoding ascii
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
  $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
  if ($config.rules[0].id -ne 'preserved-profile' -or $config.customFutureValue -ne 'preserve-unknown-field') { throw 'Profiles or unknown fields were lost' }
} finally {
  Get-Process | Where-Object { $_.Path -eq $exe } | Stop-Process -Force -ErrorAction SilentlyContinue
}

# Test actual installed renderer/startup APIs with isolated configuration, no game actions.
$testData = Join-Path $env:RUNNER_TEMP 'VoldenaSmoke'
New-Item -ItemType Directory -Path $testData -Force | Out-Null
$process = Start-Process $exe -ArgumentList @('--voldena-safe-test',"--test-data=$testData",'--startup','--verify-startup') -WindowStyle Hidden -PassThru
if (!$process.WaitForExit(45000)) { throw 'Safe installed smoke test did not exit' }
$smoke = Get-Content (Join-Path $testData 'smoke.json') -Raw | ConvertFrom-Json
if ($smoke.error -or $smoke.version -ne $version -or !$smoke.hidden -or $smoke.ui.ready -ne 'true' -or $smoke.ui.diskCount -ne 1 -or !$smoke.ui.cpu -or !$smoke.ui.autoExit) { throw 'Installed UI smoke test failed' }
if (!$smoke.startupTest.on -or $smoke.startupTest.off) { throw 'Real startup registration on/off failed' }
if ($smoke.errors.Count) { throw 'Renderer emitted errors' }
Write-Host 'Verified installed advanced UI, hidden startup, Run registration on/off, profiles and unknown fields'
