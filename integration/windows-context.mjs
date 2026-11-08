import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {join} from 'node:path';
const run=promisify(execFile);

// One PowerShell startup for package discovery, existing app and launcher ownership.
export async function windowsContext(launcherPid){
 const pid=Number.isSafeInteger(launcherPid)&&launcherPid>0?launcherPid:0;
 const source=`[Console]::OutputEncoding=[Text.UTF8Encoding]::new();$ErrorActionPreference='Stop';$p=Get-AppxPackage -Name OpenAI.Codex | Sort-Object Version -Descending | Select-Object -First 1;if($null -eq $p){throw 'Codex is not installed'};$rows=@(Get-CimInstance Win32_Process -Filter "Name='ChatGPT.exe' OR ProcessId=${pid}");$main=@($rows | Where-Object {$_.Name -eq 'ChatGPT.exe' -and $_.CommandLine -notmatch '--type=|--user-data-dir=' -and $_.ExecutablePath -like '*WindowsApps*OpenAI.Codex_*'} | ForEach-Object {@{pid=[int]$_.ProcessId;path=$_.ExecutablePath}});$owner=$rows | Where-Object {$_.ProcessId -eq ${pid}} | Select-Object -First 1;@{bootStartedAt=(Get-CimInstance Win32_OperatingSystem).LastBootUpTime.ToUniversalTime().ToString('o');package=@{version=$p.Version.ToString();family=$p.PackageFamilyName;path=$p.InstallLocation};main=$main;launcherCommand=$owner.CommandLine}|ConvertTo-Json -Depth 4 -Compress`;
 const {stdout}=await run(join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-Command',source],{windowsHide:true,encoding:'utf8',timeout:15000});
 return JSON.parse(stdout.replace(/^\uFEFF/,'').trim());
}
