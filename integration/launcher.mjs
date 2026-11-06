import {launchPipe} from './pipe-client.mjs';
import {mainProcesses} from './windows-processes.mjs';
import {readFile,writeFile,mkdir,open,unlink,stat} from 'node:fs/promises';
import {createReadStream,watchFile,unwatchFile} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash,randomBytes} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';

const root=dirname(fileURLToPath(import.meta.url)),run=promisify(execFile);
const configPath=join(root,'config.json'),statePath=join(root,'state.json'),lockPath=join(root,'launcher.lock');
const testRoot=process.argv.indexOf('--test-profile')>=0?process.argv[process.argv.indexOf('--test-profile')+1]:null;
const mode=process.argv.includes('--restore')?'restore':process.argv.includes('--diagnose')?'diagnose':'launch';
const manifest=JSON.parse(await readFile(join(root,'manifest.json'),'utf8'));
let config,client,ownedLock=false,introShown=false,ended=false,settingsQueue=Promise.resolve();
const sessions=new Map(),pendingTargets=new Set(),binding='__linker_'+randomBytes(12).toString('hex');
const psExe=join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
async function powershell(source){const {stdout}=await run(psExe,['-NoProfile','-NonInteractive','-Command',source],{windowsHide:true,maxBuffer:2*1024*1024,encoding:'utf8'});return stdout.replace(/^\uFEFF/,'').trim();}
async function json(path,fallback){try{return JSON.parse(await readFile(path,'utf8'));}catch{return fallback;}}
function clean(value){return {enabled:value?.enabled!==false,language:value?.language==='en'?'en':'zh',sound:value?.sound!==false};}
async function readConfig(){return clean(await json(configPath,{}));}
async function saveConfig(change){settingsQueue=settingsQueue.catch(()=>{}).then(async()=>{config={...await readConfig(),...change};const tmp=configPath+'.'+process.pid+'.tmp';await writeFile(tmp,JSON.stringify(config,null,2));const {rename}=await import('node:fs/promises');await rename(tmp,configPath);});await settingsQueue;}
async function state(change){const old=await json(statePath,{});await writeFile(statePath,JSON.stringify({...old,...change,updatedAt:new Date().toISOString()},null,2));}
async function log(event,detail=''){const {appendFile}=await import('node:fs/promises');try{if((await stat(join(root,'launcher.log'))).size>200000)await writeFile(join(root,'launcher.log'),'');}catch{}await appendFile(join(root,'launcher.log'),new Date().toISOString()+' '+event+' '+detail+'\n');}
async function notify(message){if(testRoot){console.log(message);return;}const script=join(root,'notice.vbs');await run(join(process.env.SystemRoot,'System32','wscript.exe'),[script,message],{windowsHide:true});}
async function restoreOriginal(){await saveConfig({enabled:false});await state({themeEnabled:false});try{const {stdout}=await run(psExe,['-NoProfile','-NonInteractive','-File',join(root,'entrypoints.ps1'),'-Action','Restore'],{windowsHide:true,encoding:'utf8'});await log('original-entry-restored',stdout.trim());}catch(error){await log('entry-restore-failed',error.message);}}
async function packageInfo(){return JSON.parse(await powershell("[Console]::OutputEncoding=[Text.UTF8Encoding]::new();$p=Get-AppxPackage -Name OpenAI.Codex | Sort-Object Version -Descending | Select-Object -First 1;if($null -eq $p){throw 'Codex is not installed'};@{version=$p.Version.ToString();family=$p.PackageFamilyName;path=$p.InstallLocation}|ConvertTo-Json -Compress"));}
async function processInfo(pid){return JSON.parse(await powershell(`$p=Get-CimInstance Win32_Process -Filter 'ProcessId=${Number(pid)}';if($p){@{pid=$p.ProcessId;command=$p.CommandLine;path=$p.ExecutablePath}|ConvertTo-Json -Compress}else{'null'}`));}
async function runningMain(){return mainProcesses();}
async function hash(path){const h=createHash('sha256');for await(const chunk of createReadStream(path))h.update(chunk);return h.digest('hex');}
function openOriginal(exe){const child=spawn(exe,[],{detached:true,windowsHide:false,stdio:'ignore'});child.unref();}
async function existingLauncher(){const lock=await json(lockPath,null);if(!lock?.pid)return false;const proc=await processInfo(lock.pid);return proc?.command?.toLowerCase().includes(join(root,'launcher.mjs').toLowerCase());}
async function cleanup(){if(ended)return;ended=true;unwatchFile(configPath);if(ownedLock){const owner=await json(lockPath,null);if(owner?.pid===process.pid)await unlink(lockPath).catch(()=>{});}await state({running:false,mounted:false}).catch(()=>{});client?.disconnect();}
async function verifiedFiles(){for(const [file,expected] of Object.entries(manifest.files)){if(await hash(join(root,file))!==expected)throw Error('Theme file integrity mismatch: '+file);}}
async function attach(target){if(ended||target.type!=='page'||!/^app:\/\/-\/index\.html(?:[?#]|$)/.test(target.url)||sessions.has(target.targetId)||pendingTargets.has(target.targetId))return;pendingTargets.add(target.targetId);try{const {sessionId}=await client.call('Target.attachToTarget',{targetId:target.targetId,flatten:true});const entry={targetId:target.targetId,sessionId,busy:false};sessions.set(target.targetId,entry);await client.call('Runtime.enable',{},sessionId);await client.call('Page.enable',{},sessionId);await apply(entry);}catch(error){await log('attach-failed',error.message);}finally{pendingTargets.delete(target.targetId);}}
let runtime,media;
async function apply(entry){if(entry.busy||ended)return;entry.busy=true;try{for(let i=0;i<80;i++){if(await client.evaluate(entry.sessionId,"location.protocol==='app:'&&location.hostname==='-'&&location.pathname==='/index.html'&&document.readyState!=='loading'&&!!document.head&&!!document.body&&!!document.getElementById('root')"))break;await delay(250);}if(!config.enabled){await client.evaluate(entry.sessionId,'window.__linkerThemeV4?.dispose();true');await state({mounted:false});return;}
 const current=await client.evaluate(entry.sessionId,'window.__linkerThemeV4?.status()||null');if(current){await client.evaluate(entry.sessionId,'window.__linkerThemeV4.update('+JSON.stringify(config)+');true');return;}
 await client.call('Runtime.addBinding',{name:binding},entry.sessionId);
 const mounted=await client.evaluate(entry.sessionId,runtime+'('+JSON.stringify({media,config,binding,playIntro:!introShown})+')');
 if(mounted?.installed){introShown=true;await state({mounted:true,version:manifest.packageVersion,pid:client.child.pid,language:config.language});await log('mounted',manifest.packageVersion);}
 }catch(error){await log('mount-failed',error.message);await state({mounted:false,error:error.message});}finally{entry.busy=false;}}
async function settingsChanged(){config=await readConfig();await state({language:config.language,themeEnabled:config.enabled});for(const entry of sessions.values())await apply(entry);}
try{
 config=await readConfig();
 await log('launch-request',testRoot?'isolated-test':mode);
 if(mode==='restore'){await restoreOriginal();await notify('已恢复原版界面和启动入口。聊天与项目保持原状。');}
 else{
  const pkg=await packageInfo(),exe=join(pkg.path,'app','ChatGPT.exe'),archive=join(pkg.path,'app','resources','app.asar');
  const supported=pkg.family===manifest.packageFamily&&pkg.version===manifest.packageVersion&&await hash(archive)===manifest.appAsarSha256;
  await verifiedFiles();
  if(mode==='diagnose'){console.log(JSON.stringify({supported,packageVersion:pkg.version,expectedVersion:manifest.packageVersion,config,installedFilesVerified:true},null,2));}
  else if(!supported){await state({mounted:false,reason:'application-updated',packageVersion:pkg.version});await log('version-guard',pkg.version);openOriginal(exe);await notify('Codex 已更新到 '+pkg.version+'，已为你打开原版。Linker 主题先暂停加载，重新核对兼容性后即可恢复。');}
  else if(!config.enabled){openOriginal(exe);}
  else if(await existingLauncher()){openOriginal(exe);}
  else if(!testRoot&&(await runningMain()).length){await state({mounted:false,running:false,themeEnabled:true,testProfile:false,pid:null,launcherPid:null,error:null,reason:'restart-required',packageVersion:pkg.version});await notify('主题已就绪。请先从系统托盘菜单完整退出当前 Codex，再打开任务栏的 Codex 图标。当前聊天会保留。');}
  else{
   await unlink(lockPath).catch(()=>{});const lock=await open(lockPath,'wx');await lock.writeFile(JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}));await lock.close();ownedLock=true;
   runtime=await readFile(join(root,'runtime.js'),'utf8');media=JSON.parse(await readFile(join(root,'media.json'),'utf8'));
   const args=[],env={};if(testRoot){const profile=join(testRoot,'browser'),data=join(testRoot,'codex');await mkdir(profile,{recursive:true});await mkdir(data,{recursive:true});args.push('--user-data-dir='+profile,'--no-first-run');Object.assign(env,{CODEX_ELECTRON_USER_DATA_PATH:profile,CODEX_HOME:data,CODEX_SQLITE_HOME:join(data,'sqlite')});}
   client=launchPipe(exe,args,env);await state({running:true,mounted:false,pid:client.child.pid,launcherPid:process.pid,packageVersion:pkg.version,testProfile:!!testRoot,error:null});
   client.events.on('Target.targetCreated',p=>attach(p.targetInfo));client.events.on('Target.targetInfoChanged',p=>attach(p.targetInfo));
   client.events.on('Target.detachedFromTarget',p=>{for(const [id,entry] of sessions)if(entry.sessionId===p.sessionId)sessions.delete(id);});
   client.events.on('Page.loadEventFired',(_,sessionId)=>{const entry=[...sessions.values()].find(e=>e.sessionId===sessionId);if(entry)apply(entry);});
   client.events.on('Runtime.bindingCalled',async(p,sessionId)=>{if(p.name!==binding||![...sessions.values()].some(s=>s.sessionId===sessionId))return;try{const message=JSON.parse(p.payload);if(message.action==='language'&&['zh','en'].includes(message.value))await saveConfig({language:message.value});if(message.action==='sound'&&typeof message.value==='boolean')await saveConfig({sound:message.value});if(message.action==='enabled'&&message.value===false)await restoreOriginal();if(message.action==='introComplete'&&['complete','skipped','media-error','render-error'].includes(message.value))await state({lastIntroResult:message.value});}catch(error){await log('settings-error',error.message);}});
   client.events.on('closed',async()=>{await cleanup();process.exit(0);});client.events.on('launchError',async error=>{await log('launch-error',error.message);await cleanup();process.exit(1);});
   await client.call('Browser.getVersion');await client.call('Target.setDiscoverTargets',{discover:true});for(const target of (await client.call('Target.getTargets')).targetInfos)await attach(target);
   watchFile(configPath,{interval:500},()=>settingsChanged().catch(e=>log('settings-error',e.message)));
   if(testRoot){
    const output=join(testRoot,'verification');await mkdir(output,{recursive:true});const seen=new Set();
    const inspector=setInterval(async()=>{if(ended){clearInterval(inspector);return;}for(const entry of sessions.values()){try{const snapshot=await client.evaluate(entry.sessionId,"({status:window.__linkerThemeV4?.status()||null,customNodes:document.querySelectorAll('[id^=linker-pearl-v4-]').length,background:getComputedStyle(document.body).backgroundImage==='none'?'none':'image',rootPresent:!!document.getElementById('root')})");const key=snapshot.status?.introStage||snapshot.status?.lastIntroResult||(seen.has('ready')?'restored':'native');if(!seen.has(key)){seen.add(key);await writeFile(join(output,key+'.json'),JSON.stringify(snapshot,null,2));const shot=await client.call('Page.captureScreenshot',{format:'png'},entry.sessionId);await writeFile(join(output,key+'.png'),Buffer.from(shot.data,'base64'));console.log(JSON.stringify(snapshot));}}catch{}}},700);
   }
   process.on('SIGTERM',async()=>{for(const entry of sessions.values())await client.evaluate(entry.sessionId,'window.__linkerThemeV4?.dispose();true').catch(()=>{});await cleanup();process.exit(0);});
  }
 }
}catch(error){await log('error',error.stack||error.message);await cleanup();if(mode==='diagnose'){console.error(error.message);process.exitCode=1;}else await notify('Linker 主题未能启动：'+error.message+'\n可以继续从官方入口打开 Codex。');}
