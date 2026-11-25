// Exercise a real renderer reload in a disposable official-app profile.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
import {windowsContext} from './windows-context.mjs';

const baseline=process.argv.includes('--baseline'),language=process.argv.includes('--english')?'en':'zh';
const output=resolve('integration/verification',(baseline?'reload-baseline-':'intro-reload-')+Date.now()),modules=join(output,'modules'),profile=join(output,'profile');
await mkdir(modules,{recursive:true});await mkdir(profile,{recursive:true});
const installed=join(process.env.LOCALAPPDATA,'Linker','CodexTheme','versions','0.5.1'),source=baseline?installed:resolve('integration');
for(const name of ['launcher.mjs','compatibility.mjs','media-delivery.mjs'])await copyFile(join(source,name),join(modules,name));
if(!baseline)await copyFile('integration/intro-guard.mjs',join(modules,'intro-guard.mjs'));
if(!baseline){await copyFile('integration/updater-health.mjs',join(modules,'updater-health.mjs'));await writeFile(join(modules,'packaged-client.mjs'),`import {launchPackaged as real} from ${JSON.stringify(pathToFileURL(resolve('integration/packaged-client.mjs')).href)};export async function launchPackaged(pkg,args,env){return globalThis.__reloadClient=await real(pkg,args,env,{hostPath:${JSON.stringify(resolve('integration/bundle/PackageHost.exe'))}});}`);}
await writeFile(join(modules,'pipe-client.mjs'),`import {launchPipe as real} from ${JSON.stringify(pathToFileURL(resolve('integration/pipe-client.mjs')).href)};export function launchPipe(...args){return globalThis.__reloadClient=real(...args);}`);
// Keep test-owned shadow handles for real mouse input; production runtime stays unchanged.
const inspect="if(!window.__reloadShadows){window.__reloadShadows=[];window.__audioStarts=[];const original=Element.prototype.attachShadow;Element.prototype.attachShadow=function(options){const s=original.call(this,options);window.__reloadShadows.push(s);return s;};const audioStart=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...args){window.__audioStarts.push({offset:args[1]||0,duration:this.buffer?.duration});return audioStart.apply(this,args);};}\n";
await writeFile(join(output,'runtime.js'),inspect+await readFile(baseline?join(installed,'runtime.js'):'integration/bundle/runtime.js','utf8'));
const release={directory:output,manifest:{version:baseline?'0.5.1':'reload-fix'}},pkg=(await windowsContext()).package,config={enabled:true,language,sound:false,autoUpdate:false},abort=new AbortController();
await writeFile(join(profile,'config.json'),JSON.stringify(config));
const {startSession}=await import(pathToFileURL(join(modules,'launcher.mjs')));
let client,sessionPromise,session;const result={passed:false,baseline,language,stages:[]};
async function until(fn,label,timeout=45000){const end=Date.now()+timeout;while(Date.now()<end){const value=await fn();if(value)return value;await delay(100);}throw Error('Timeout: '+label);}
const status=()=>client.evaluate(session,'window.__linkerThemeV4?.status()||null').catch(()=>null);
async function clickAction(id='action'){
 await client.call('Page.bringToFront',{},session);
 await client.evaluate(session,'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');
 const locate=()=>client.evaluate(session,"(()=>{const root=window.__reloadShadows?.findLast(s=>s.host.isConnected&&s.host.id==='linker-pearl-v4-intro'),b=root?.getElementById("+JSON.stringify(id)+");if(!b||b.hidden||b.disabled)return null;const r=b.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return root.elementFromPoint(x,y)?.closest('button')===b?{x,y}:null;})()");
 // A renderer reports ready before the native window finishes its resize/loading overlay.
 let previous='',stableAt=Date.now();
 const box=id==='restore-original'?await until(async()=>{const p=await locate(),key=JSON.stringify(p);if(!p||key!==previous){previous=key;stableAt=Date.now();return false;}return Date.now()-stableAt>=750&&p;},'stable restore button hit target',15000):await locate();
 if(box&&id==='restore-original')result.restoreHit=box;
 if(box)for(const type of ['mousePressed','mouseReleased'])await client.call('Input.dispatchMouseEvent',{type,...box,button:'left',clickCount:1},session);
}
async function reload(){const previous=(await status())?.mountId;await client.call('Page.reload',{},session);return until(async()=>{const s=await status();return s&&s.mountId!==previous&&s;},'remount');}
async function screenshot(name){const shot=await client.call('Page.captureScreenshot',{format:'png'},session);await writeFile(join(output,name+'.png'),Buffer.from(shot.data,'base64'));}
async function resumed(expected,previousMountId){
 let sawGuard=false;
 const value=await until(async()=>{
  const sample=await client.evaluate(session,"(()=>{const s=window.__linkerThemeV4?.status()||null,g=document.getElementById('linker-pearl-v4-reload-guard'),p=getComputedStyle(document.documentElement,'::after');return {status:s,root:!!document.getElementById('root'),covered:!!g&&p.position==='fixed'&&p.backgroundColor==='rgb(245, 248, 251)'||!!document.getElementById('linker-pearl-v4-intro'),guard:!!g};})()").catch(()=>null);
  if(!sample)return false;if(sample.root)assert.equal(sample.covered,true,'Native interface exposed before intro completed');
  if(sample.guard)sawGuard=true;
  const s=sample.status;return s?.mountId!==previousMountId&&s?.introStage===expected&&s.introProgress?.audioState==='running'&&s;
 },'resumed '+expected);
 result.guardObserved=result.guardObserved||sawGuard;return value;
}
try{
 sessionPromise=startSession({installRoot:profile,stateRoot:profile,testRoot:profile,release,mediaPath:resolve('integration/bundle/media.json'),pkg,config,ui:{readyMs:0,close(){}},signal:abort.signal,started:performance.now()});sessionPromise.catch(()=>{});
 client=await until(()=>globalThis.__reloadClient,'client');
 const target=await until(async()=>(await client.call('Target.getTargets')).targetInfos.find(t=>t.type==='page'&&/^app:\/\/-\/index.html/.test(t.url)),'target');
 session=(await client.call('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
 await client.call('Page.bringToFront',{},session);
 await until(async()=>(await status())?.introStage==='ready','ready');
 if(process.argv.includes('--restore-only')){
  await client.evaluate(session,'window.__linkerThemeV4.skipIntro();true');await reload();await client.evaluate(session,'window.__linkerThemeV4.replay();true');await until(async()=>(await status())?.introStage==='ready','replay');await clickAction('restore-original');await until(async()=>!(await status()),'restored');result.passed=true;
 }else{
 result.before=await until(async()=>{const s=await status();if(s?.introStage==='ready')await clickAction();return s?.introStage==='access'&&(baseline||s.introProgress?.elapsed>=1.2)&&s;},'playing');
 await client.call('Page.reload',{},session);
 result.after=baseline?await until(status,'remount'):await resumed('access',result.before.mountId);
 if(baseline){result.reproduced=result.before.intro===true&&result.after.intro===false&&result.after.lastIntroResult===null;assert.equal(result.reproduced,true);}
 else {
  assert.equal(result.after.intro,true);assert.ok(result.after.introProgress.elapsed>=result.before.introProgress.elapsed-.6);
  result.voiceOffsets=await client.evaluate(session,'window.__audioStarts');assert.ok(result.voiceOffsets.some(s=>s.offset>.5));await screenshot('resumed-access');
  if(process.argv.includes('--rapid')){
   const previous=(await status()).mountId;await client.call('Page.reload',{},session);
   const loading=await until(async()=>{const s=await status();return s&&s.mountId!==previous&&s;},'loading after first reload');
   await client.call('Page.reload',{},session);result.rapidReload=await resumed('access',loading.mountId);assert.equal(result.rapidReload.intro,true);
  }
  await until(async()=>{const s=await status();if(!s)return false;if(result.stages.at(-1)!==s.introStage)result.stages.push(s.introStage);assert.equal(s.intro,true);if(s.introStage==='greeting'&&s.introProgress.elapsed>=2.5)return true;await clickAction();return false;},'greeting',65000);
  result.beforeGreeting=await status();await client.call('Page.reload',{},session);result.afterGreeting=await resumed('greeting',result.beforeGreeting.mountId);
  result.resumedVideo=await client.evaluate(session,"Math.max(...Array.from(window.__reloadShadows.at(-1).querySelectorAll('video'),v=>v.currentTime))");
  assert.ok(result.resumedVideo>2);assert.ok(result.afterGreeting.introProgress.elapsed>=result.beforeGreeting.introProgress.elapsed-.6);await screenshot('resumed-greeting');
  await until(async()=>{const s=await status();if(!s)return false;if(result.stages.at(-1)!==s.introStage)result.stages.push(s.introStage);return s.lastIntroResult==='complete';},'complete');
  await reload();result.afterCompletedReload=await status();assert.equal(result.afterCompletedReload.intro,false);assert.equal(await client.evaluate(session,"!!document.getElementById('linker-pearl-v4-reload-guard')"),false);
  await client.evaluate(session,'window.__linkerThemeV4.replay();true');await until(async()=>(await status())?.introStage==='ready','replay');
  await client.call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},session);await until(async()=>(await status())?.lastIntroResult==='skipped','skip');
  await reload();assert.equal((await status()).intro,false);assert.equal(await client.evaluate(session,"!!document.getElementById('linker-pearl-v4-reload-guard')"),false);
  result.completeThenReload=true;result.skipThenReload=true;
  await client.evaluate(session,'window.__linkerThemeV4.replay();true');await until(async()=>(await status())?.introStage==='ready','restore replay');await clickAction('restore-original');
  await until(async()=>!(await status()),'restored');await client.call('Page.reload',{},session);
  await until(()=>client.evaluate(session,"document.readyState==='complete'&&!!document.getElementById('root')&&!window.__linkerThemeV4&&!document.getElementById('linker-pearl-v4-reload-guard')").catch(()=>false),'restored reload');
  assert.equal(JSON.parse(await readFile(join(profile,'config.json'),'utf8')).enabled,false);result.restoreThenReload=true;
 }
 result.passed=true;
 }
}catch(error){result.error=error.stack;if(session){await screenshot('failure').catch(()=>{});result.hitDiagnostics=await client.evaluate(session,"(()=>{const root=window.__reloadShadows?.at(-1),button=root?.getElementById('action'),r=button?.getBoundingClientRect();return {guard:!!window.__linkerIntroGuard,stage:window.__linkerThemeV4?.status(),rect:r?.toJSON(),zoom:getComputedStyle(document.documentElement).zoom,rootBox:document.documentElement.getBoundingClientRect().toJSON(),hit:r?document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.outerHTML.slice(0,400):null};})()").catch(()=>null);}process.exitCode=1;}
finally{
 if(client?.child.pid)await promisify(execFile)('taskkill.exe',['/PID',String(client.child.pid),'/T','/F'],{windowsHide:true}).catch(()=>{});
 await sessionPromise?.catch(()=>{});abort.abort();await writeFile(join(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({output,...result}));
}
