param([ValidateSet('Prepare','Inspect','Restore')][string]$Action='Inspect')
$ErrorActionPreference='Stop'
$root=$PSScriptRoot
$appId='OpenAI.Codex_2p2nqsd0c76g0!App'
$internalLink=Join-Path $root 'Codex.lnk'
$originalLink=Join-Path $root 'original-codex-entry.lnk'
$pinFolder=Join-Path $env:APPDATA 'Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar'
$wsh=New-Object -ComObject WScript.Shell
Add-Type -Path (Join-Path $root 'ShortcutIdentity.cs')
function Test-ManagedLink([string]$Path) {
 if(-not(Test-Path -LiteralPath $Path)){return $false}
 $link=$wsh.CreateShortcut($Path)
 return $link.TargetPath -eq (Join-Path $env:WINDIR 'System32\wscript.exe') -and $link.Arguments -eq ('"'+(Join-Path $root 'launch.vbs')+'"')
}
function Get-ManagedPins {
 @(Get-ChildItem -LiteralPath $pinFolder -Filter '*.lnk' -File -Force | Where-Object {Test-ManagedLink $_.FullName} | Select-Object -ExpandProperty FullName)
}
if($Action -eq 'Prepare') {
 if(-not(Test-Path -LiteralPath $originalLink)) {
  $originalSource=Join-Path ([Environment]::GetFolderPath('Desktop')) 'produce\Codex.lnk'
  $shell=New-Object -ComObject Shell.Application
  $folder=$shell.NameSpace((Split-Path -LiteralPath $originalSource))
  $item=$folder.ParseName([IO.Path]::GetFileName($originalSource))
  if($item.ExtendedProperty('System.Link.TargetParsingPath') -ne $appId){throw 'Original Codex entry is not recognized.'}
  Copy-Item -LiteralPath $originalSource -Destination $originalLink
 }
 $package=Get-AppxPackage -Name OpenAI.Codex | Select-Object -First 1
 $iconLocation=(Join-Path $package.InstallLocation 'app\ChatGPT.exe')+',0'
 # Keep the official icon in a stable local path; Store version directories disappear.
 try {
  Add-Type -AssemblyName System.Drawing
  $officialIcon=[Drawing.Icon]::ExtractAssociatedIcon((Join-Path $package.InstallLocation 'app\ChatGPT.exe'))
  if($officialIcon){
   $stableIcon=Join-Path $root 'Codex.ico'
   $iconStream=[IO.File]::Create($stableIcon)
   try{$officialIcon.Save($iconStream)}finally{$iconStream.Dispose();$officialIcon.Dispose()}
   $iconLocation=$stableIcon+',0'
  }
 } catch { Write-Warning 'Using the application icon directly.' }
 $link=$wsh.CreateShortcut($internalLink)
 $link.TargetPath=Join-Path $env:WINDIR 'System32\wscript.exe'
 $link.Arguments='"'+(Join-Path $root 'launch.vbs')+'"'
 $link.WorkingDirectory=$root
 $link.IconLocation=$iconLocation
 $link.Description='Codex'
 $link.WindowStyle=7
 $link.Save()
 [Linker.ShortcutIdentity]::Set($internalLink,$appId)
 foreach($pin in @(Get-ManagedPins)) {
  $pinBackup=Join-Path $root ('entry-backups\'+[IO.Path]::GetFileName($pin))
  if(-not(Test-Path -LiteralPath $pinBackup)){New-Item -ItemType Directory -Path (Split-Path -Parent $pinBackup) -Force | Out-Null;Copy-Item -LiteralPath $pin -Destination $pinBackup}
  $pinnedLink=$wsh.CreateShortcut($pin);$pinnedLink.IconLocation=$iconLocation;$pinnedLink.Save()
  [Linker.ShortcutIdentity]::Set($pin,$appId)
 }
 @{shortcut=$internalLink;appId=[Linker.ShortcutIdentity]::Get($internalLink);ready=$true}|ConvertTo-Json -Compress
} elseif($Action -eq 'Restore') {
 if(-not(Test-Path -LiteralPath $originalLink)){'{"restored":false,"reason":"no-managed-entry"}';exit 0}
 $targets=@($internalLink)+@(Get-ManagedPins)
 $restored=@(foreach($target in $targets){if(Test-ManagedLink $target){Copy-Item -LiteralPath $originalLink -Destination $target -Force;$target}})
 @{restored=$true;entries=$restored}|ConvertTo-Json -Compress
} else {
 $pins=@(Get-ManagedPins)
 @{prepared=(Test-ManagedLink $internalLink);managedPins=$pins;appId=if(Test-Path -LiteralPath $internalLink){[Linker.ShortcutIdentity]::Get($internalLink)}else{$null}}|ConvertTo-Json -Compress
}
