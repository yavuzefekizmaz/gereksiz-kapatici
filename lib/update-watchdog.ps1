param([string]$Payload)
$ErrorActionPreference = 'Stop'
$data = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Payload)) | ConvertFrom-Json
function Save-Result([string]$status) {
  @{status=$status;expectedVersion=$data.version;time=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json -Compress | Set-Content -LiteralPath $data.reportPath -Encoding UTF8
}
try {
  # Do not relaunch or interfere if the parent never relinquishes its installation.
  $parent = Get-Process -Id $data.parentPid -ErrorAction SilentlyContinue
  if ($parent -and !$parent.WaitForExit(30000)) { Save-Result 'handoff-not-completed'; exit 1 }
  $deadline = [DateTime]::UtcNow.AddSeconds(150)
  do {
    Start-Sleep -Seconds 2
    $file = Get-Item -LiteralPath $data.exe -ErrorAction SilentlyContinue
    if ($file -and $file.VersionInfo.ProductVersion -like ($data.version + '*')) {
      $running = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $data.exe })
      if (!$running.Count) { Start-Process -FilePath $data.exe -WindowStyle Hidden; Start-Sleep -Seconds 3 }
      $running = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $data.exe })
      if ($running.Count) { Save-Result 'installed-and-restarted'; exit 0 }
    }
  } while ([DateTime]::UtcNow -lt $deadline)
  Save-Result 'installation-canceled-or-failed'
  # An aborted UAC prompt/setup must not leave the user with a silently closed app.
  if (Test-Path -LiteralPath $data.exe) { Start-Process -FilePath $data.exe -WindowStyle Hidden }
} catch { try { Save-Result 'verification-failed' } catch {} }
