param([string]$Payload)
$ErrorActionPreference='Stop'
$data=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Payload)) | ConvertFrom-Json
$sessionId=(Get-Process -Id $PID).SessionId
$outcomes=@()
try {
  Set-Content -LiteralPath ($data.base+'.ready') -Value 'watching-game'
  # Independent of Voldena's lifetime. PID plus creation time prevents reuse errors.
  $deadline=[DateTime]::UtcNow.AddHours(24)
  do {
    $active=$false
    foreach($game in $data.games){
      $process=Get-Process -Id $game.pid -ErrorAction SilentlyContinue
      if($process -and $process.SessionId -eq $sessionId -and $process.StartTime.ToUniversalTime().Ticks.ToString() -eq $game.startedAt){$active=$true}
    }
    if(Test-Path -LiteralPath ($data.base+'.cancel')){throw 'Canceled before handoff'}
    if(!$active){break}
    if([DateTime]::UtcNow -gt $deadline){throw 'Game wait expired; no apps launched'}
    Start-Sleep -Seconds 3
  } while($true)
  foreach($target in $data.targets){
    $mutex=$null;$locked=$false
    try {
      if(!(Test-Path -LiteralPath $target.path -PathType Leaf) -or [IO.Path]::GetExtension($target.path) -ine '.exe'){throw 'Executable not available'}
      if($target.path.StartsWith($env:WINDIR+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Windows executable excluded'}
      $hash=[Security.Cryptography.SHA256]::Create()
      try{$key=[BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($target.path.ToLowerInvariant()))).Replace('-','')}finally{$hash.Dispose()}
      $mutex=[Threading.Mutex]::new($false,('Local\VoldenaRestore_'+$key))
      $locked=$mutex.WaitOne(5000)
      if(!$locked){throw 'Another restore is starting this application'}
      $running=@(Get-Process -ErrorAction Stop | Where-Object {$_.SessionId -eq $sessionId -and $_.Path -ieq $target.path})
      if($target.wallpaper -and $running.Count){
        Start-Process -FilePath $target.path -ArgumentList @('-control','play') -WorkingDirectory (Split-Path -LiteralPath $target.path) -WindowStyle Hidden
        $outcomes+=@{target=$target.path;outcome='resume-requested'}
      }elseif($running.Count){$outcomes+=@{target=$target.path;outcome='already-running'}}
      else{Start-Process -FilePath $target.path -WorkingDirectory (Split-Path -LiteralPath $target.path);$outcomes+=@{target=$target.path;outcome='launched'}}
      Start-Sleep -Milliseconds 500
    }catch{$outcomes+=@{target=$target.path;outcome='failed';reason=$_.Exception.Message}}
    finally{if($locked){$mutex.ReleaseMutex()};if($mutex){$mutex.Dispose()}}
  }
}catch{$outcomes+=@{outcome='watch-failed';reason=$_.Exception.Message}}
finally {ConvertTo-Json -InputObject @($outcomes) -Depth 4 | Set-Content -LiteralPath ($data.base+'.result.json') -Encoding UTF8}
