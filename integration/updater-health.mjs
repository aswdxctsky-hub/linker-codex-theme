import {readdir,readFile,stat} from 'node:fs/promises';
import {join} from 'node:path';
export function classifyUpdaterLog(text){
 if(/Updater unavailable after init|failureReason=no-package-identity|missing Windows package identity/.test(text))return 'unavailable';
 if(/\[windows-offers\] Windows update eligibility|\[windows-updater\].*(manifest|check|download|update|Store)/i.test(text))return 'ready';
 if(/in_app_updates_policy_latch[^\n]*enabled=false/.test(text))return 'disabled-by-policy';
 return 'pending';
}
export async function updaterHealth(pid,{since=0}={}){
 const roots=[join(process.env.LOCALAPPDATA,'Codex','Logs'),join(process.env.LOCALAPPDATA,'Packages','OpenAI.Codex_2p2nqsd0c76g0','LocalCache','Local','Codex','Logs')];
 const files=[];
 for(const root of roots)for(let offset=0;offset<3;offset++){
  const d=new Date(Date.now()-offset*86400000),day=join(root,String(d.getUTCFullYear()),String(d.getUTCMonth()+1).padStart(2,'0'),String(d.getUTCDate()).padStart(2,'0'));
  for(const name of await readdir(day).catch(()=>[]))if(name.includes('-'+pid+'-')&&name.endsWith('.log')){
   const path=join(day,name),info=await stat(path).catch(()=>null);
   if(info&&info.birthtimeMs>=since-1000)files.push(path);
  }
 }
 const text=(await Promise.all(files.map(p=>readFile(p,'utf8').catch(()=>'')))).join('\n');
 return {status:classifyUpdaterLog(text),logFiles:files};
}
