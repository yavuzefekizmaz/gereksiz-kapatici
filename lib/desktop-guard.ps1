param([string]$Payload)
$ErrorActionPreference='Stop'
$data=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Payload)) | ConvertFrom-Json
$sessionId=(Get-Process -Id $PID).SessionId
$parent=Get-Process -Id $data.parentPid -ErrorAction Stop
$parentStarted=$parent.StartTime.Ticks
$explorerPath=Join-Path $env:WINDIR 'explorer.exe'
function Get-SessionExplorer {
  @(Get-Process -Name explorer -ErrorAction SilentlyContinue | Where-Object {$_.SessionId -eq $sessionId -and $_.Path -ieq $explorerPath})
}
function Game-IsRunning {
  $names=@(Get-Content -LiteralPath ($data.base+'.json') -Raw | ConvertFrom-Json)
  @(Get-Process -Name $names -ErrorAction SilentlyContinue | Where-Object {$_.SessionId -eq $sessionId}).Count -gt 0
}
$closed=$false
try {
  if (!(Game-IsRunning) -or (Test-Path -LiteralPath ($data.base+'.restore'))) { throw 'No matching active application' }
  $explorers=Get-SessionExplorer
  if (!$explorers.Count) { throw 'Explorer was already absent; do not acquire it' }
  # The watchdog itself owns the closure and always restores in finally.
  foreach($item in $explorers) {
    $again=Get-Process -Id $item.Id -ErrorAction Stop
    if($again.SessionId -ne $sessionId -or $again.Path -ine $explorerPath -or $again.StartTime.Ticks -ne $item.StartTime.Ticks){throw 'Explorer identity changed'}
    $closed=$true
    Stop-Process -Id $again.Id -ErrorAction Stop
  }
  Set-Content -LiteralPath ($data.base+'.ready') -Value 'guard-active'
  $deadline=[DateTime]::UtcNow.AddHours(2)
  do {
    Start-Sleep -Seconds 1
    $liveParent=Get-Process -Id $data.parentPid -ErrorAction SilentlyContinue
    if(!$liveParent -or $liveParent.StartTime.Ticks -ne $parentStarted){break}
    if(Test-Path -LiteralPath ($data.base+'.restore')){break}
    if(!(Game-IsRunning)){break}
    # If the user restored Explorer, do not fight them by closing it again.
    if((Get-SessionExplorer).Count){break}
  } while([DateTime]::UtcNow -lt $deadline)
} finally {
  if($closed -and !(Get-SessionExplorer).Count){Start-Process -FilePath $explorerPath -WindowStyle Normal}
  Set-Content -LiteralPath ($data.base+'.done') -Value 'restored-or-no-change'
}
