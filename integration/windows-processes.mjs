import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {join} from 'node:path';

const run=promisify(execFile);
const psExe=join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');

export function parseProcessList(output){
 const value=output.replace(/^\uFEFF/,'').trim();
 if(!value)return [];
 const data=JSON.parse(value);
 if(data===null)return [];
 return (Array.isArray(data)?data:[data]).filter(row=>row&&Number.isInteger(row.pid)&&typeof row.path==='string');
}

export async function mainProcesses(executable='ChatGPT.exe'){
 if(!/^[a-zA-Z0-9_.-]+\.exe$/.test(executable))throw Error('Invalid executable name');
 const source=`[Console]::OutputEncoding=[Text.UTF8Encoding]::new();$ErrorActionPreference='Stop';$items=@(Get-CimInstance Win32_Process -Filter "Name='${executable}'" | Where-Object {$_.CommandLine -notmatch '--type=|--user-data-dir='} | ForEach-Object {@{pid=[int]$_.ProcessId;path=$_.ExecutablePath}});ConvertTo-Json -InputObject $items -Compress`;
 const {stdout}=await run(psExe,['-NoProfile','-NonInteractive','-Command',source],{windowsHide:true,encoding:'utf8'});
 return parseProcessList(stdout).filter(p=>p.path.includes('OpenAI.Codex_'));
}
