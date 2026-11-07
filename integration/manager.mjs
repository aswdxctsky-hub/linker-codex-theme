import {readFile,writeFile,appendFile,mkdir,copyFile,access} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {readJson,atomicJson} from './compatibility.mjs';
import {windowsContext} from './windows-context.mjs';
import {progressWindow} from './progress-window.mjs';
import {latestRelease,installRuntime,prepareMedia,verifyVersion,activate,compareVersions,digest,safeVersion} from './release-store.mjs';
import {cachedCompatibility,ensureCompatible} from './auto-compatibility.mjs';

const run=promisify(execFile);
export async function runManager({installRoot,stateRoot,testRoot,current,publicKey,started,args}){
 const configPath=join(stateRoot,'config.json'),statePath=join(stateRoot,'state.json');
 const config={enabled:true,language:'zh',sound:true,autoUpdate:true,...await readJson(configPath,{})};
 if(config.autoCompatibility===false)config.autoUpdate=false;
 const diagnostic=args.includes('--diagnose'),updateOnly=args.includes('--update-only');
 const log=(event,detail='')=>appendFile(join(stateRoot,'launcher.log'),new Date().toISOString()+' '+event+' '+detail+'\n');
 if(args.includes('--restore')){
  await atomicJson(configPath,{...config,enabled:false});
  if(!testRoot)await run(join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-File',join(installRoot,'entrypoints.ps1'),'-Action','Restore'],{windowsHide:true});
  console.log(JSON.stringify({restored:true}));return;
 }
 const initialMedia=join(installRoot,'media',current.manifest.media.contentSha256);
 const ui=progressWindow(current.directory,initialMedia,{enabled:!diagnostic&&!args.includes('--no-ui'),startedAt:started});
 const abort=new AbortController();let pkg,sessionStarted=false,originalChosen=false;
 const updateProgress=({received,total})=>ui.update({title:'正在同步',english:'Synchronizing',detail:'下载主题更新',progress:total?received/total:null});
 function registeredOriginal(){if(testRoot)return;const child=spawn('explorer.exe',['shell:AppsFolder\\OpenAI.Codex_2p2nqsd0c76g0!App'],{windowsHide:true,detached:true,stdio:'ignore'});child.on('error',()=>{});child.unref();}
 async function mediaFor(release){
  const base=join(installRoot,'media',release.manifest.media.contentSha256,'media.json'),local=join(stateRoot,'media',release.manifest.media.contentSha256,'media.json');
  if(base!==local){try{await access(local);}catch{try{await access(base);await mkdir(join(stateRoot,'media',release.manifest.media.contentSha256),{recursive:true});await copyFile(base,local);}catch{}}}
  return prepareMedia(stateRoot,release.manifest,{signal:abort.signal,onProgress:updateProgress});
 }
 async function original(reason){
  if(originalChosen)return;originalChosen=true;ui.close();
  await log('original',reason);await atomicJson(statePath,{running:false,mounted:false,reason,packageVersion:pkg?.version||null,themeEnabled:config.enabled!==false});
  if(!pkg){registeredOriginal();return;}
  const launchArgs=[],env={...process.env};
  if(testRoot){const browser=join(testRoot,'browser'),data=join(testRoot,'codex');await mkdir(browser,{recursive:true});await mkdir(data,{recursive:true});launchArgs.push('--user-data-dir='+browser,'--no-first-run');Object.assign(env,{CODEX_ELECTRON_USER_DATA_PATH:browser,CODEX_HOME:data,CODEX_SQLITE_HOME:join(data,'sqlite')});}
  const child=spawn(join(pkg.path,'app','ChatGPT.exe'),launchArgs,{windowsHide:false,detached:true,stdio:'ignore',env});child.on('error',error=>{void log('original-error',error.message);registeredOriginal();});child.unref();
  if(testRoot)await atomicJson(statePath,{running:true,mounted:false,pid:child.pid,reason,packageVersion:pkg.version,testProfile:true});
 }
 ui.events.on('original',()=>{abort.abort(Error('Original requested'));ui.close();if(pkg)original('user-request').catch(()=>{});});
 ui.events.on('failure',error=>log('waiting-window-error',error.message));
 const lookup=!diagnostic&&config.enabled!==false&&config.autoUpdate!==false?latestRelease(publicKey,{signal:abort.signal}).catch(async error=>{await log('update-unavailable',error.message);return null;}):Promise.resolve(null);
 try{
  const context=await windowsContext(null);pkg=context.package;await log('launch-request',diagnostic?'diagnose':testRoot?'isolated-test':'launch');
  if(originalChosen)return;
  if(abort.signal.aborted){await original('user-request');return;}
  const cached=await cachedCompatibility(stateRoot,pkg,current);
  if(diagnostic){console.log(JSON.stringify({packageVersion:pkg.version,themeRelease:current.manifest.version,signedFilesVerified:true,localCompatibility:!!cached,autoUpdate:config.autoUpdate!==false,discoveryMs:Math.round(performance.now()-started)}));return;}
  if(config.enabled===false){await original('disabled');return;}
  if(!testRoot&&context.main.length&&!updateOnly){await original('already-running');return;}
  const failed=await readJson(join(stateRoot,'update-state.json'),{});let selected=current;
  async function chooseUpdate(){
   const pending=await readJson(join(stateRoot,'pending.json'),null);
   if(pending&&compareVersions(pending.version,current.manifest.version)>0&&pending.version!==failed.rejectedVersion){
    try{selected=await verifyVersion(join(stateRoot,'versions',safeVersion(pending.version)),publicKey);return;}catch(error){await log('pending-invalid',error.message);}
   }
   const latest=await lookup;
   if(latest&&compareVersions(latest.manifest.version,current.manifest.version)>0&&latest.manifest.version!==failed.rejectedVersion){ui.update({title:'正在同步',english:'Synchronizing',detail:'下载主题更新',progress:0});selected=await installRuntime(stateRoot,latest,publicKey,{signal:abort.signal,onProgress:updateProgress});}
  }
  if(!cached||updateOnly||await readJson(join(stateRoot,'pending.json'),null)){
   ui.update({title:'正在同步',english:'Synchronizing',detail:'检查可用更新',progress:null});
   try{await chooseUpdate();}catch(error){await log('update-install-failed',error.message);selected=current;}
  }
  let media,compatibility;
  try{
   media=await mediaFor(selected);
   const candidate=await import(pathToFileURL(join(selected.directory,'auto-compatibility.mjs')));
   compatibility=await candidate.ensureCompatible({root:stateRoot,pkg,release:selected,mediaPath:media.path,ui,signal:abort.signal,force:args.includes('--force-probe')});
  }catch(error){
   await log('compatibility-failed',error.message);
   if(selected.manifest.version===current.manifest.version||abort.signal.aborted){await original(abort.signal.aborted?'user-request':'compatibility-failed');return;}
   await atomicJson(join(stateRoot,'update-state.json'),{rejectedVersion:selected.manifest.version,reason:error.message});await atomicJson(join(stateRoot,'pending.json'),null);selected=current;
   try{media=await mediaFor(current);compatibility=await ensureCompatible({root:stateRoot,pkg,release:current,mediaPath:media.path,ui,signal:abort.signal});}catch{await original('compatibility-failed');return;}
  }
  abort.signal.throwIfAborted();
  if(selected.manifest.version!==current.manifest.version){
   if(!await readJson(join(stateRoot,'current.json'),null))await activate(stateRoot,current.manifest.version);
   await atomicJson(join(stateRoot,'boot-status.json'),{version:selected.manifest.version,pid:process.pid,ready:false});
   await activate(stateRoot,selected.manifest.version);await atomicJson(join(stateRoot,'pending.json'),null);
  }
  await log('compatible',pkg.version+' '+(compatibility.cached?'cached':'local-test'));
  if(updateOnly){await atomicJson(join(stateRoot,'boot-status.json'),{version:selected.manifest.version,pid:process.pid,ready:true});console.log(JSON.stringify({updated:true,version:selected.manifest.version,app:pkg.version,compatibilityCached:compatibility.cached}));return;}
  ui.update({title:'正在连接',english:'Connecting',detail:'载入启动界面',progress:null});
  const session=await import(pathToFileURL(join(selected.directory,'launcher.mjs')));sessionStarted=true;
  await session.startSession({installRoot,stateRoot,testRoot,release:selected,mediaPath:media.path,pkg,config,ui,signal:abort.signal,started,onReady:async timings=>{
   await atomicJson(join(stateRoot,'boot-status.json'),{version:selected.manifest.version,pid:process.pid,ready:true});await log('startup-timings',JSON.stringify(timings));
   // A known working startup never waits on the network. Later releases are staged for the next launch.
   if(selected.manifest.version===current.manifest.version&&!updateOnly)void (async()=>{
    const latest=await lookup;if(!latest||latest.manifest.version===failed.rejectedVersion||compareVersions(latest.manifest.version,selected.manifest.version)<=0)return;
    const next=await installRuntime(stateRoot,latest,publicKey,{signal:abort.signal});await mediaFor(next);await atomicJson(join(stateRoot,'pending.json'),{version:next.manifest.version});await log('update-staged',next.manifest.version);
   })().catch(error=>log('background-update-failed',error.message));
  }});
 }catch(error){await log('startup-failed',error.message);if(!sessionStarted||error.nativeAvailable===false)await original(abort.signal.aborted?'user-request':'startup-failed');}
 finally{ui.close();abort.abort();}
}
