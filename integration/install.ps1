$ErrorActionPreference = 'Stop'
$source = $PSScriptRoot
$destination = Join-Path $env:LOCALAPPDATA 'Linker\CodexTheme'
$desktop = [Environment]::GetFolderPath('Desktop')
$programs = Join-Path ([Environment]::GetFolderPath('Programs')) 'Codex Linker'
$node = (Get-Command node.exe -ErrorAction Stop).Source
$package = Get-AppxPackage -Name OpenAI.Codex | Sort-Object Version -Descending | Select-Object -First 1
if ($package.Version.ToString() -ne '26.1029.7803.0') { throw 'This package must be revalidated for the installed Codex version.' }
$executable = Join-Path $package.InstallLocation 'app\ChatGPT.exe'
$archiveHash = (Get-FileHash -LiteralPath (Join-Path $package.InstallLocation 'app\resources\app.asar') -Algorithm SHA256).Hash.ToLowerInvariant()
if ($archiveHash -ne '77ed4ddc5b388ac8b29f5035f9c98f982b095df55aad6fa6c27bb80d763b9691') { throw 'The application build differs from the verified build.' }
$backup = $null
if (Test-Path -LiteralPath $destination) {
  if (-not (Test-Path -LiteralPath (Join-Path $destination 'installation.json'))) { throw 'Existing destination is not a recognized Linker installation.' }
  $backup = Join-Path $env:LOCALAPPDATA ('Linker\Backups\CodexTheme-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
  New-Item -ItemType Directory -Path $backup -Force | Out-Null
  Copy-Item -LiteralPath $destination -Destination $backup -Recurse
}
New-Item -ItemType Directory -Path $destination -Force | Out-Null
foreach ($name in @('launcher.mjs','pipe-client.mjs','windows-processes.mjs','notice.vbs','entrypoints.ps1','ShortcutIdentity.cs')) { Copy-Item -LiteralPath (Join-Path $source $name) -Destination (Join-Path $destination $name) -Force }
foreach ($name in @('runtime.js','media.json')) { Copy-Item -LiteralPath (Join-Path $source ('bundle\'+$name)) -Destination (Join-Path $destination $name) -Force }
Copy-Item -LiteralPath (Join-Path $source '..\concept-v4\THIRD-PARTY-NOTICES.md') -Destination (Join-Path $destination 'THIRD-PARTY-NOTICES.md') -Force
Copy-Item -LiteralPath (Join-Path $source 'README.md') -Destination (Join-Path $destination '使用说明.md') -Force
$config=@{enabled=$true;language='zh';sound=$true}
if(Test-Path -LiteralPath (Join-Path $destination 'config.json')){$config=Get-Content -LiteralPath (Join-Path $destination 'config.json') -Raw | ConvertFrom-Json;$config.enabled=$true}
$config|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $destination 'config.json') -Encoding utf8
$files = @{}
foreach ($name in @('runtime.js','media.json','pipe-client.mjs','windows-processes.mjs','entrypoints.ps1','ShortcutIdentity.cs')) { $files[$name]=(Get-FileHash -LiteralPath (Join-Path $destination $name) -Algorithm SHA256).Hash.ToLowerInvariant() }
@{schema=1;themeVersion=4;packageVersion=$package.Version.ToString();packageFamily=$package.PackageFamilyName;appAsarSha256=$archiveHash;files=$files} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $destination 'manifest.json') -Encoding utf8
foreach ($mode in @('launch','restore')) {
  $arguments = if ($mode -eq 'restore') { ' --restore' } else { '' }
  $command = '"'+$node+'" "'+(Join-Path $destination 'launcher.mjs')+'"'+$arguments
  $vbs = 'Option Explicit' + "`r`n" + 'Dim shell' + "`r`n" + 'Set shell = CreateObject("WScript.Shell")' + "`r`n" + 'shell.Run "'+$command.Replace('"','""')+'", 0, False' + "`r`n"
  [IO.File]::WriteAllText((Join-Path $destination ($mode+'.vbs')),$vbs,[Text.Encoding]::Unicode)
}
$shell = New-Object -ComObject WScript.Shell
$retired = @()
foreach ($entry in @(@{name='Codex · Linker';mode='launch';description='启动 Linker 开场与主题'},@{name='恢复 Codex 原界面';mode='restore';description='关闭 Linker 主题，保留原有聊天与项目'})) {
  foreach ($location in @($desktop,$programs)) {
    $path = Join-Path $location ($entry.name+'.lnk')
    if(Test-Path -LiteralPath $path){
      $existing=$shell.CreateShortcut($path)
      if($existing.TargetPath -eq (Join-Path $env:WINDIR 'System32\wscript.exe') -and $existing.Arguments -eq ('"'+(Join-Path $destination ($entry.mode+'.vbs'))+'"')){
        $retiredFolder=Join-Path $backup 'retired-entries';New-Item -ItemType Directory -Path $retiredFolder -Force|Out-Null
        $archived=Join-Path $retiredFolder (($retired.Count.ToString())+'-'+$entry.name+'.lnk')
        Move-Item -LiteralPath $path -Destination $archived
        $retired += $path
      }
    }
  }
}
if((Test-Path -LiteralPath $programs) -and @(Get-ChildItem -LiteralPath $programs -Force).Count -eq 0){Remove-Item -LiteralPath $programs}
& (Join-Path $destination 'entrypoints.ps1') -Action Prepare
@{installedAt=(Get-Date).ToUniversalTime().ToString('o');destination=$destination;node=$node;packageVersion=$package.Version.ToString();backup=$backup;retiredShortcuts=$retired;entry=(Join-Path $destination 'Codex.lnk');entryType='taskbar';originalApplicationModified=$false;originalProfileModified=$false} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $destination 'installation.json') -Encoding utf8
Get-Content -LiteralPath (Join-Path $destination 'installation.json')
