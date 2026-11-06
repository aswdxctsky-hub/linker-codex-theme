import {launchPipe} from './pipe-client.mjs';
import {windowsContext} from './windows-context.mjs';
import {mountTheme} from './media-delivery.mjs';
import {findCompatibility,verifyArchive,sha256,readJson,atomicJson} from './compatibility.mjs';
import {readFile,writeFile,mkdir,open,unlink,stat,appendFile} from 'node:fs/promises';
import {watchFile,unwatchFile} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {randomBytes} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';

const root=dirname(fileURLToPath(import.meta.url)),run=promisify(execFile),started=performance.now(),timings={};
const testAt=process.argv.indexOf('--test-profile'),testRoot=testAt>=0?resolve(process.argv[testAt+1]):null;
const mode=process.argv.includes('--restore')?'restore':process.argv.includes('--diagnose')?'diagnose':'launch';
// Isolated runs keep all mutable state out of the installed theme and signed-in profile.
const stateRoot=testRoot||root;
await mkdir(stateRoot,{recursive:true});
const configPath=join(stateRoot,'config.json'),statePath=join(stateRoot,'state.json'),lockPath=join(stateRoot,'launcher.lock');
const manifest=await readJson(join(root,'manifest.json'),null);
const psExe=join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
let config,client,ownedLock=false,introShown=false,ended=false,settingsQueue=Promise.resolve(),stateQueue=Promise.resolve(),exe,pkg,runtime,media;
const sessions=new Map(),pendingTargets=new Set(),binding='__linker_'+randomBytes(12).toString('hex');
function mark(name){timings[name]=Math.round(performance.now()-started);}
function clean(value){return {enabled:value?.enabled!==false,language:value?.language==='en'?'en':'zh',sound:value?.sound!==false,autoCompatibility:value?.autoCompatibility!==false};}
async function readConfig(){return clean(await readJson(configPath,{}));}
async function saveConfig(change){settingsQueue=settingsQueue.catch(()=>{}).then(async()=>{config={...await readConfig(),...change};await atomicJson(configPath,config);});await settingsQueue;}
async function state(change){stateQueue=stateQueue.catch(()=>{}).then(async()=>{const old=await readJson(statePath,{});await atomicJson(statePath,{...old,...change,updatedAt:new Date().toISOString()});});await stateQueue;}
async function log(event,detail=''){const path=join(stateRoot,'launcher.log');try{if((await stat(path)).size>200000)await writeFile(path,'');}catch{}await appendFile(path,new Date().toISOString()+' '+event+' '+detail+'\n');}
async function notify(message){if(testRoot){console.log(message);return;}await run(join(process.env.SystemRoot,'System32','wscript.exe'),[join(root,'notice.vbs'),message],{windowsHide:true});}
async function restoreOriginal(){
 await saveConfig({enabled:false});await state({themeEnabled:false});
 if(testRoot)return;
 try{const {stdout}=await run(psExe,['-NoProfile','-NonInteractive','-File',join(root,'entrypoints.ps1'),'-Action','Restore'],{windowsHide:true,encoding:'utf8'});await log('original-entry-restored',stdout.trim());}catch(error){await log('entry-restore-failed',error.message);}
}
function openOriginal(){if(testRoot||!exe)return;const child=spawn(exe,[],{detached:true,windowsHide:false,stdio:'ignore'});child.on('error',error=>log('original-launch-error',error.message).catch(()=>{}));child.unref();}
async function cleanup(){if(ended)return;ended=true;unwatchFile(configPath);if(ownedLock){const owner=await readJson(lockPath,null);if(owner?.pid===process.pid)await unlink(lockPath).catch(()=>{});await state({running:false,mounted:false}).catch(()=>{});}client?.disconnect();}
async function verifiedFiles(){if(!manifest?.files)throw Error('Theme manifest is missing');await Promise.all(Object.entries(manifest.files).map(async([file,expected])=>{if(await sha256(join(root,file))!==expected)throw Error('Theme file integrity mismatch: '+file);}));}
async function attach(target){
 if(ended||target.type!=='page'||!/^app:\/\/-\/index\.html(?:[?#]|$)/.test(target.url)||sessions.has(target.targetId)||pendingTargets.has(target.targetId))return;
 pendingTargets.add(target.targetId);
 try{const {sessionId}=await client.call('Target.attachToTarget',{targetId:target.targetId,flatten:true});const entry={targetId:target.targetId,sessionId,busy:false};sessions.set(target.targetId,entry);await client.call('Runtime.enable',{},sessionId);await client.call('Page.enable',{},sessionId);await apply(entry);}catch(error){await log('attach-failed',error.message);}finally{pendingTargets.delete(target.targetId);}
}
async function apply(entry){
 if(entry.busy||ended)return;entry.busy=true;
 try{
  let ready=false;
  for(let i=0;i<100;i++){ready=await client.evaluate(entry.sessionId,"location.protocol==='app:'&&location.hostname==='-'&&location.pathname==='/index.html'&&document.readyState!=='loading'&&!!document.head&&!!document.body&&!!document.getElementById('root')");if(ready)break;await delay(100);}
  if(!ready)throw Error('Native app root was not ready');
  if(!config.enabled){await client.evaluate(entry.sessionId,'window.__linkerThemeV4?.dispose();true');await state({mounted:false});return;}
  const current=await client.evaluate(entry.sessionId,'window.__linkerThemeV4?.status()||null');
  if(current){await client.evaluate(entry.sessionId,'window.__linkerThemeV4.update('+JSON.stringify(config)+');true');return;}
  await client.call('Runtime.addBinding',{name:binding},entry.sessionId);
  const {mounted,delivery}=await mountTheme(client,entry.sessionId,runtime,media,{config,binding,playIntro:!introShown});
  delivery.catch(error=>log('media-delivery-error',error.message));
  if(mounted?.installed){introShown=true;mark('mounted');await state({mounted:true,version:pkg.version,pid:client.child.pid,language:config.language,timings});await log('mounted',pkg.version);await log('startup-timings',JSON.stringify(timings));}
 }catch(error){await log('mount-failed',error.message);await state({mounted:false,error:error.message});}finally{entry.busy=false;}
}
async function settingsChanged(){config=await readConfig();await state({language:config.language,themeEnabled:config.enabled});for(const entry of sessions.values())await apply(entry);}
async function launch(){
 config=await readConfig();await log('launch-request',testRoot?'isolated-test':mode);
 if(mode==='restore'){await restoreOriginal();await notify('已恢复原版界面和启动入口。聊天与项目保持原状。');return;}
 const lock=await readJson(lockPath,null),context=await windowsContext(lock?.pid);pkg=context.package;exe=join(pkg.path,'app','ChatGPT.exe');mark('discovery');
 if(mode==='launch'&&!config.enabled){openOriginal();return;}
 if(mode==='launch'&&context.launcherCommand?.toLowerCase().includes(join(root,'launcher.mjs').toLowerCase())){openOriginal();return;}
 if(mode==='launch'&&!testRoot&&context.main.length){await state({mounted:false,running:false,themeEnabled:true,testProfile:false,pid:null,launcherPid:null,error:null,reason:'restart-required',packageVersion:pkg.version});await notify('请先从系统托盘菜单完整退出当前 Codex，再打开任务栏的 Codex 图标。当前聊天会保留。');return;}
 const integrity=verifiedFiles();integrity.catch(()=>{});
 const match=await findCompatibility(root,pkg,{online:config.autoCompatibility});
 const archive=match.entry?await verifyArchive(join(pkg.path,'app','resources','app.asar'),match.entry.appAsarSha256,join(stateRoot,'archive-cache.json'),{force:process.argv.includes('--full-check')}):{valid:false,cached:false};
 const supported=!!match.entry&&archive.valid;await integrity;mark('verified');
 if(mode==='diagnose'){console.log(JSON.stringify({supported,packageVersion:pkg.version,compatibilitySource:match.source,archiveCached:archive.cached,installedFilesVerified:true,config,timings},null,2));return;}
 if(!supported){
  openOriginal();await state({running:false,mounted:false,pid:null,launcherPid:null,reason:'application-updated',packageVersion:pkg.version,error:null});await log('version-guard',pkg.version+' '+match.source);
  const noticePath=join(stateRoot,'update-notice.json'),notice=await readJson(noticePath,{});
  if(notice.version!==pkg.version){await atomicJson(noticePath,{version:pkg.version});await notify('Codex 已更新到 '+pkg.version+'，当前先打开原版。主题会自动获取已验证的兼容记录；暂未适配时不会影响原版使用。');}
  return;
 }
 if(lock){const current=await readJson(lockPath,null);if(current&&current.pid!==lock.pid)return;await unlink(lockPath).catch(()=>{});}
 let owned;try{owned=await open(lockPath,'wx');}catch(error){if(error.code==='EEXIST')return;throw error;}
 await owned.writeFile(JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}));await owned.close();ownedLock=true;
 const content=Promise.all([readFile(join(root,'runtime.js'),'utf8'),readFile(join(root,'media.json'),'utf8')]);content.catch(()=>{});
 const args=[],env={};if(testRoot){const profile=join(testRoot,'browser'),data=join(testRoot,'codex');await mkdir(profile,{recursive:true});await mkdir(data,{recursive:true});args.push('--user-data-dir='+profile,'--no-first-run');Object.assign(env,{CODEX_ELECTRON_USER_DATA_PATH:profile,CODEX_HOME:data,CODEX_SQLITE_HOME:join(data,'sqlite')});}
 client=launchPipe(exe,args,env);mark('spawned');
 await state({running:true,mounted:false,pid:client.child.pid,launcherPid:process.pid,packageVersion:pkg.version,testProfile:!!testRoot,reason:null,error:null,themeEnabled:true,archiveCached:archive.cached,compatibilitySource:match.source});
 [runtime,media]=await content;media=JSON.parse(media);
 client.events.on('Target.targetCreated',p=>attach(p.targetInfo));client.events.on('Target.targetInfoChanged',p=>attach(p.targetInfo));
 client.events.on('Target.detachedFromTarget',p=>{for(const [id,entry] of sessions)if(entry.sessionId===p.sessionId)sessions.delete(id);});
 client.events.on('Page.loadEventFired',(_,sessionId)=>{const entry=[...sessions.values()].find(e=>e.sessionId===sessionId);if(entry)apply(entry);});
 client.events.on('Runtime.bindingCalled',async(p,sessionId)=>{
  if(p.name!==binding||![...sessions.values()].some(s=>s.sessionId===sessionId))return;
  try{const message=JSON.parse(p.payload);if(message.action==='language'&&['zh','en'].includes(message.value))await saveConfig({language:message.value});if(message.action==='sound'&&typeof message.value==='boolean')await saveConfig({sound:message.value});if(message.action==='enabled'&&message.value===false)await restoreOriginal();if(message.action==='introComplete'&&['complete','skipped','media-error','render-error'].includes(message.value))await state({lastIntroResult:message.value});}catch(error){await log('settings-error',error.message);}
 });
 client.events.on('closed',async()=>{await cleanup();process.exit(0);});client.events.on('launchError',async error=>{await log('launch-error',error.message);await cleanup();process.exit(1);});
 await client.call('Browser.getVersion');await client.call('Target.setDiscoverTargets',{discover:true});for(const target of (await client.call('Target.getTargets')).targetInfos)await attach(target);
 watchFile(configPath,{interval:500},()=>settingsChanged().catch(error=>log('settings-error',error.message)));
 process.on('SIGTERM',async()=>{for(const entry of sessions.values())await client.evaluate(entry.sessionId,'window.__linkerThemeV4?.dispose();true').catch(()=>{});await cleanup();process.exit(0);});
}
try{await launch();}catch(error){await log('error',error.stack||error.message);const hadApp=!!client;await cleanup();if(mode==='diagnose'){console.error(error.message);process.exitCode=1;}else{if(!hadApp)openOriginal();await notify('主题暂未加载，已保留原版界面。'+error.message);}}
