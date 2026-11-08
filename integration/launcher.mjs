import {launchPipe} from './pipe-client.mjs';
import {mountTheme} from './media-delivery.mjs';
import {INTRO_GUARD_SOURCE} from './intro-guard.mjs';
import {readJson,atomicJson} from './compatibility.mjs';
import {readFile,mkdir,appendFile} from 'node:fs/promises';
import {watchFile,unwatchFile} from 'node:fs';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomBytes} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';

const run=promisify(execFile);
export async function startSession({installRoot,stateRoot,testRoot,release,mediaPath,pkg,config,ui,signal,started,onReady=()=>{}}){
 const configPath=join(stateRoot,'config.json'),statePath=join(stateRoot,'state.json'),sessions=new Map(),pending=new Set();
 const token='__linker_'+randomBytes(12).toString('hex'),timings={firstFeedbackMs:ui?.readyMs||null};
 let ended=false,introFinished=false,introProgress=null,introOwner=null,firstReady=false,settingsQueue=Promise.resolve(),stateQueue=Promise.resolve(),runtime,media;
 const log=(event,value='')=>appendFile(join(stateRoot,'launcher.log'),new Date().toISOString()+' '+event+' '+value+'\n');
 const state=change=>stateQueue=stateQueue.catch(()=>{}).then(async()=>atomicJson(statePath,{...await readJson(statePath,{}),...change,updatedAt:new Date().toISOString()}));
 const save=change=>settingsQueue=settingsQueue.catch(()=>{}).then(async()=>{config={...config,...await readJson(configPath,{}),...change};await atomicJson(configPath,config);});
 const content=Promise.all([readFile(join(release.directory,'runtime.js'),'utf8'),readFile(mediaPath,'utf8')]);content.catch(()=>{});
 const args=[],env={};if(testRoot){const profile=join(testRoot,'browser'),data=join(testRoot,'codex');await mkdir(profile,{recursive:true});await mkdir(data,{recursive:true});args.push('--user-data-dir='+profile,'--no-first-run');Object.assign(env,{CODEX_ELECTRON_USER_DATA_PATH:profile,CODEX_HOME:data,CODEX_SQLITE_HOME:join(data,'sqlite')});}
 const client=launchPipe(join(pkg.path,'app','ChatGPT.exe'),args,env);timings.nativeStartedMs=Math.round(performance.now()-started);
 let resolveClosed,rejectClosed;const closed=new Promise((a,b)=>{resolveClosed=a;rejectClosed=b;});closed.catch(()=>{});
 client.events.on('closed',resolveClosed);client.events.on('launchError',rejectClosed);
 const abortSession=()=>{config.enabled=false;rejectClosed(Error('Original requested'));};signal?.addEventListener('abort',abortSession,{once:true});
 async function restore(){
  await save({enabled:false});await state({themeEnabled:false});
  if(!testRoot)await run(join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-File',join(installRoot,'entrypoints.ps1'),'-Action','Restore'],{windowsHide:true,encoding:'utf8'});
 }
 async function clearGuard(entry){
  const id=entry.guardId;entry.guardId=null;
  if(id)await client.call('Page.removeScriptToEvaluateOnNewDocument',{identifier:id},entry.sessionId).catch(()=>{});
  await client.evaluate(entry.sessionId,'window.__linkerIntroGuard?.remove();true').catch(()=>{});
 }
 async function ensureGuard(entry){
  if(entry.guardId||introFinished||config.enabled===false)return;
  if(entry.guardPending)return entry.guardPending;
  entry.guardPending=(async()=>{const result=await client.call('Page.addScriptToEvaluateOnNewDocument',{source:INTRO_GUARD_SOURCE},entry.sessionId);entry.guardId=result.identifier;if(introFinished||config.enabled===false)await clearGuard(entry);})().finally(()=>entry.guardPending=null);
  return entry.guardPending;
 }
 function acceptProgress(value){
  if(!value||!Number.isInteger(value.stage)||value.stage< -1||value.stage>10||!Number.isFinite(value.elapsed)||!Number.isFinite(value.flowElapsed)||!['zh','en'].includes(value.language)||!['zh','en'].includes(value.stageLanguage))return null;
  return {stage:value.stage,elapsed:Math.max(0,Math.min(180,value.elapsed)),flowElapsed:Math.max(0,Math.min(600,value.flowElapsed)),language:value.language,stageLanguage:value.stageLanguage,pendingLanguage:['zh','en'].includes(value.pendingLanguage)?value.pendingLanguage:null,queued:value.queued===true};
 }
 async function apply(entry){
  if(ended||client.closed)return;if(entry.busy){entry.again=true;return;}entry.busy=true;const generation=entry.generation;
  try{
   let ready=false;
   for(let i=0;i<250&&!ended;i++){ready=await client.evaluate(entry.sessionId,"location.protocol==='app:'&&location.hostname==='-'&&location.pathname==='/index.html'&&document.readyState!=='loading'&&!!document.head&&!!document.body&&!!document.getElementById('root')");if(ready)break;await delay(100);}
   if(!ready)throw Error('Native app root unavailable');
   if(!timings.nativeRootMs)timings.nativeRootMs=Math.round(performance.now()-started);
   if(generation!==entry.generation){entry.again=true;return;}
   if(config.enabled===false){await clearGuard(entry);await client.evaluate(entry.sessionId,'window.__linkerThemeV4?.dispose();true');await state({mounted:false});return;}
   const current=await client.evaluate(entry.sessionId,'window.__linkerThemeV4?.status()||null');
   if(current){await client.evaluate(entry.sessionId,'window.__linkerThemeV4.update('+JSON.stringify(config)+');true');return;}
   await client.call('Runtime.addBinding',{name:token},entry.sessionId);
   await ensureGuard(entry);
   if(!introFinished)await client.evaluate(entry.sessionId,INTRO_GUARD_SOURCE);
   const resumeIntro=introProgress,playIntro=!introFinished;
   entry.mountId=randomBytes(12).toString('hex');if(playIntro)introOwner=entry.sessionId;
   const {mounted,delivery}=await mountTheme(client,entry.sessionId,runtime,media,{config,binding:token,playIntro,resumeIntro,mountId:entry.mountId});
   delivery.catch(error=>{if(!ended&&generation===entry.generation)return log('media-error',error.message);});
   if(!mounted?.installed)throw Error('Theme mount failed');
   if(playIntro&&resumeIntro?.stage>=0){
    await delivery;
    if(generation!==entry.generation){entry.again=true;return;}
    await client.evaluate(entry.sessionId,'window.__linkerThemeV4?.resumeIntro()',{userGesture:true});
    await log('intro-resumed',JSON.stringify({stage:resumeIntro.stage,elapsed:Math.round(resumeIntro.elapsed*1000)}));
   }
   if(!firstReady){
    for(let i=0;i<160;i++){const status=await client.evaluate(entry.sessionId,'window.__linkerThemeV4?.status()');if((status?.introStage&&!['loading-images','resuming'].includes(status.introStage))||['skipped','complete'].includes(status?.lastIntroResult)){firstReady=true;break;}if(status?.lastIntroResult?.endsWith('error'))throw Error('Theme media failed');await delay(100);}
    if(!firstReady)throw Error('Theme first frame timed out');
    timings.firstFeedbackMs=ui?.readyMs||timings.firstFeedbackMs;timings.themeVisibleMs=Math.round(performance.now()-started);
    await onReady(timings);ui?.close();
   }
   if(generation!==entry.generation){entry.again=true;return;}
   await state({mounted:true,themeEnabled:true,reason:null,error:null,packageVersion:pkg.version,themeRelease:release.manifest.version,language:config.language,timings});
   await log('mounted',pkg.version+' theme='+release.manifest.version);
  }catch(error){
   if(!ended&&!client.closed&&(generation!==entry.generation||/Execution context|Cannot find context|Inspected target navigated/.test(error.message))){entry.again=true;await log('document-changing','retry mount');}
   else{await log('mount-failed',error.message);await clearGuard(entry);await state({mounted:false,error:error.message});ui?.close();if(!firstReady)rejectClosed(error);}
  }
  finally{entry.busy=false;if(entry.again&&!ended&&!client.closed){entry.again=false;const retry=setTimeout(()=>apply(entry),100);retry.unref();}}
 }
 async function attach(target){
  if(ended||target.type!=='page'||!/^app:\/\/-\/index\.html(?:[?#]|$)/.test(target.url)||sessions.has(target.targetId)||pending.has(target.targetId))return;
  pending.add(target.targetId);
  try{const {sessionId}=await client.call('Target.attachToTarget',{targetId:target.targetId,flatten:true});const entry={sessionId,busy:false,generation:0,again:false};sessions.set(target.targetId,entry);await client.call('Runtime.enable',{},sessionId);await client.call('Page.enable',{},sessionId);await ensureGuard(entry);await apply(entry);}
  catch(error){await log('attach-error',error.message);}finally{pending.delete(target.targetId);}
 }
 async function settingsChanged(){config={...config,...await readJson(configPath,{})};await state({themeEnabled:config.enabled!==false,language:config.language});for(const entry of sessions.values())await apply(entry);}
 let watchdog;
 try{
  await state({running:true,mounted:false,pid:client.child.pid,launcherPid:process.pid,reason:null,error:null,packageVersion:pkg.version,testProfile:!!testRoot});
  [runtime,media]=await content;media=JSON.parse(media);
  client.events.on('Target.targetCreated',p=>attach(p.targetInfo));client.events.on('Target.targetInfoChanged',p=>attach(p.targetInfo));
  client.events.on('Target.detachedFromTarget',p=>{for(const [id,entry] of sessions)if(entry.sessionId===p.sessionId)sessions.delete(id);});
  client.events.on('Page.frameNavigated',(p,sessionId)=>{if(p.frame?.parentId)return;const entry=[...sessions.values()].find(e=>e.sessionId===sessionId);if(entry){entry.generation++;if(entry.mountId)void log('page-reloaded',JSON.stringify({introFinished,stage:introProgress?.stage??null}));void apply(entry);}});
  client.events.on('Page.loadEventFired',(_,sessionId)=>{const entry=[...sessions.values()].find(e=>e.sessionId===sessionId);if(entry)apply(entry);});
  client.events.on('Runtime.bindingCalled',async(p,sessionId)=>{
   if(p.name!==token||![...sessions.values()].some(e=>e.sessionId===sessionId))return;
   try{
    const message=JSON.parse(p.payload),entry=[...sessions.values()].find(e=>e.sessionId===sessionId);
    if(message.mountId!==entry?.mountId)return;
    if(message.action==='language'&&['zh','en'].includes(message.value))await save({language:message.value});
    if(message.action==='sound'&&typeof message.value==='boolean')await save({sound:message.value});
    if(message.action==='enabled'&&message.value===false)await restore();
    if(message.action==='introProgress'&&(introOwner===sessionId||introFinished&&message.value?.stage===-1)){const progress=acceptProgress(message.value);if(progress){introOwner=sessionId;introProgress=progress;introFinished=false;await ensureGuard(entry);}}
    if(message.action==='introComplete'&&introOwner===sessionId&&['complete','skipped','media-error','render-error'].includes(message.value)){introFinished=true;introProgress=null;await state({lastIntroResult:message.value});await log('intro-complete',message.value);for(const value of sessions.values())await clearGuard(value);}
   }
   catch(error){await log('settings-error',error.message);}
  });
  watchdog=setTimeout(()=>{if(!firstReady)rejectClosed(Error('Application startup timeout'));},45000);watchdog.unref();
  await client.call('Browser.getVersion');await client.call('Target.setDiscoverTargets',{discover:true});for(const target of (await client.call('Target.getTargets')).targetInfos)void attach(target);
  watchFile(configPath,{interval:500},()=>settingsChanged().catch(error=>log('settings-error',error.message)));
  await closed;
 }catch(error){
  for(const entry of sessions.values()){await clearGuard(entry);await client.evaluate(entry.sessionId,'window.__linkerThemeV4?.dispose();true').catch(()=>{});}
  error.nativeAvailable=!!client.child.pid&&!client.closed;
  throw error;
 }finally{
  ended=true;signal?.removeEventListener('abort',abortSession);clearTimeout(watchdog);unwatchFile(configPath);ui?.close();client.disconnect();await state({running:false,mounted:false});
 }
}
