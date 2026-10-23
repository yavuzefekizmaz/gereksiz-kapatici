param([Parameter(Mandatory=$true)][string]$Exe)
$ErrorActionPreference = 'Stop'
foreach ($existing in @($false, $true)) {
  $data = Join-Path $env:TEMP ("VoldenaQuickTest-" + [guid]::NewGuid().ToString())
  New-Item -ItemType Directory -Path $data | Out-Null
  $safeArgs = @('--voldena-safe-test', "--test-data=$data", '--hidden')
  if ($existing) {
    $first = Start-Process -FilePath $Exe -ArgumentList $safeArgs -WindowStyle Hidden -PassThru
    Start-Sleep -Milliseconds 1800
    $second = Start-Process -FilePath $Exe -ArgumentList ($safeArgs + '--quick-boost') -WindowStyle Hidden -PassThru
    if (!$second.WaitForExit(15000)) { throw 'Second instance did not forward quick boost and exit' }
  } else {
    $first = Start-Process -FilePath $Exe -ArgumentList ($safeArgs + '--quick-boost') -WindowStyle Hidden -PassThru
  }
  if (!$first.WaitForExit(20000)) { throw 'Quick boost did not fully exit' }
  $result = Get-Content -LiteralPath (Join-Path $data 'last-quick-boost.json') -Raw | ConvertFrom-Json
  if ($result.mode -ne 'quick-boost' -or $result.detected -ne $false -or $result.error) { throw 'Safe no-game quick boost result was incorrect' }
  Write-Host "Verified quick boost with existing instance=$existing, no game actions, report and full exit"
}
