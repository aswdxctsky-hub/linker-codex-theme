param([string]$Bundle)
$ErrorActionPreference='Stop'
$themeNode=(Get-Command node.exe -ErrorAction Stop).Source
$themeArgs=@((Join-Path $PSScriptRoot 'install-release.mjs'))
if($Bundle){$themeArgs+=@('--bundle',$Bundle)}
& $themeNode @themeArgs
if($LASTEXITCODE -ne 0){throw 'Theme installation failed'}
