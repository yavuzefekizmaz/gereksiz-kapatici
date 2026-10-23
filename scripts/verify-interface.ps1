param([Parameter(Mandatory=$true)][string]$Exe)
$ErrorActionPreference='Stop'
$data=Join-Path $env:TEMP ('VoldenaInterface-'+[guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $data | Out-Null
$process=Start-Process -FilePath $Exe -ArgumentList @('--voldena-safe-test',"--test-data=$data",'--verify-ui','--hidden') -WindowStyle Hidden -PassThru
if(!$process.WaitForExit(60000)){throw 'Interface test did not exit'}
$result=Get-Content -LiteralPath (Join-Path $data 'smoke.json') -Raw | ConvertFrom-Json
$result.features | ConvertTo-Json -Depth 4 | Write-Host
if($result.error -or !$result.features.themes -or !$result.features.autoRestorePreference -or !$result.features.discoveredGameProfile -or !$result.features.explorerCancel -or !$result.features.profileSteps -or !$result.features.diagnosticsExport -or !$result.features.singleCountdown -or $result.errors.Count){throw 'Interface verification failed'}
