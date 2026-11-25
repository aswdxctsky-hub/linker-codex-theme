import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,copyFile,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {launchPackaged} from './packaged-client.mjs';
import {windowsContext} from './windows-context.mjs';
import {mountTheme} from './media-delivery.mjs';
import {updaterHealth} from './updater-health.mjs';
const run=promisify(execFile),authenticated=process.argv.includes('--authenticated'),original=process.argv.includes('--original');
const root=resolve('integration/verification','packaged-'+Date.now()),profile=join(root,'browser'),data=join(root,'codex');
await mkdir(profile,{recursive:true});await mkdir(data,{recursive:true});
if(authenticated)await copyFile(join(process.env.USERPROFILE,'.codex/auth.json'),join(data,'auth.json'));
const pkg=(await windowsContext()).package,result={passed:false,packageVersion:pkg.version,authenticated,original};let client;
async function until(fn,label,timeout=process.argv.includes('--manual-check')?240000:100000){const end=Date.now()+timeout;while(Date.now()<end){const value=await fn();if(value)return value;await delay(200);}throw Error('Timeout: '+label);}
try{
 client=await launchPackaged(pkg,['--user-data-dir='+profile,'--no-first-run'],{CODEX_ELECTRON_USER_DATA_PATH:profile,CODEX_HOME:data,CODEX_SQLITE_HOME:join(data,'sqlite')},{debug:!original,hostPath:resolve('integration/bundle/PackageHost.exe')});
 result.pid=client.child.pid;result.identity=client.identity;assert.ok(client.identity.includes('_'+pkg.version+'_'));
 if(!original){
  const target=await until(async()=>(await client.call('Target.getTargets')).targetInfos.find(t=>t.type==='page'&&/^app:\/\/-\/index\.html/.test(t.url)),'main page');
  const session=(await client.call('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
  await until(()=>client.evaluate(session,authenticated?"!!document.querySelector('[data-app-shell-frame]')":"document.readyState==='complete'&&!!document.querySelector('button')"),'native shell');
  const measure="(()=>{const q=s=>{const e=document.querySelector(s);if(!e)return null;const c=getComputedStyle(e);return {background:c.backgroundColor,image:c.backgroundImage.startsWith('url(')?'image':c.backgroundImage,bounds:e.getBoundingClientRect().toJSON(),opacity:c.opacity}};return {body:q('body'),frame:q('[data-app-shell-frame]'),main:q('[data-app-shell-main-surface]'),sidebar:q('[data-app-shell-left-panel-appearance]'),composer:q('[data-composer-surface-variant]'),nodes:document.querySelectorAll('[id^=linker-pearl-v4-]').length}})()";
  result.before=await client.evaluate(session,measure);
  const runtime=await readFile('integration/bundle/runtime.js','utf8'),media=JSON.parse(await readFile('integration/bundle/media.json','utf8'));
  const {mounted,delivery}=await mountTheme(client,session,runtime,media,{config:{sound:false,language:'zh'},binding:'__linker_probe',playIntro:false});assert.equal(mounted.installed,true);await delivery;
  result.after=await client.evaluate(session,measure);assert.notEqual(result.after.body.image,'none');
  if(authenticated){assert.equal(result.after.main.background,'rgba(0, 0, 0, 0)');assert.equal(result.after.frame.background,'rgba(0, 0, 0, 0)');assert.deepEqual(result.after.main.bounds,result.before.main.bounds);}
  result.largeSurfaces=await client.evaluate(session,"Array.from(document.querySelectorAll('#root *')).filter(e=>{const r=e.getBoundingClientRect();return r.width>innerWidth*.5&&r.height>innerHeight*.5}).map(e=>({tag:e.tagName,class:e.className,background:getComputedStyle(e).backgroundColor,image:getComputedStyle(e).backgroundImage}))");
  if(authenticated)assert.equal(result.largeSurfaces.filter(s=>/^rgb\(/.test(s.background)).length,0,'Opaque shell layer still covers the background');
  if(authenticated)result.updater=await until(async()=>{const health=await updaterHealth(client.child.pid,{since:client.startedAt});if(health.status==='unavailable')throw Error('Official updater unavailable');return health.status==='ready'?health:null;},'official updater');
  const updateControls=()=>client.evaluate(session,"Array.from(document.querySelectorAll('button,[role=progressbar]')).map(b=>({text:[b.innerText,b.getAttribute('aria-label'),b.title].filter(Boolean).join(' '),visible:b.getBoundingClientRect().width>0})).filter(b=>/^(正在下载|下载中|正在安装|更新可用|有可用更新|更新并|安装更新|重新启动|Downloading|Installing|Update available|Restart to update)/i.test(b.text)).map(b=>({text:b.text.slice(0,120),visible:b.visible}))");
  result.updateControls=process.argv.includes('--expect-update')?await until(async()=>{const controls=await updateControls();return controls.some(c=>c.visible)&&controls;},'visible native update control',30000):await updateControls();
  await writeFile(join(root,'theme.png'),Buffer.from((await client.call('Page.captureScreenshot',{},session)).data,'base64'));
  await client.evaluate(session,'window.__linkerThemeV4.dispose();true');result.restored=await client.evaluate(session,measure);assert.equal(result.restored.nodes,0);assert.equal(result.restored.body.image,result.before.body.image);assert.equal(result.restored.main?.background,result.before.main?.background);
 }else{
  await delay(3000);await run('powershell.exe',['-NoProfile','-Command',`Get-Process -Id ${client.child.pid} -ErrorAction Stop | Out-Null`],{windowsHide:true});
  if(authenticated)result.updater=await until(async()=>{const health=await updaterHealth(client.child.pid,{since:client.startedAt});if(health.status==='unavailable')throw Error('Original updater unavailable');return health.status==='ready'?health:null;},'original updater');
 }
 result.passed=true;if(process.argv.includes('--manual-check'))await delay(15000);
}catch(error){result.error=error.stack;process.exitCode=1;}
finally{
 if(client){if(!original)await client.call('Browser.close').catch(()=>{});await run('taskkill.exe',['/PID',String(client.child.pid),'/T','/F'],{windowsHide:true}).catch(()=>{});client.disconnect();}
 await rm(join(data,'auth.json'),{force:true});
 await writeFile(join(root,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({root,passed:result.passed,error:result.error,packageVersion:result.packageVersion,identity:result.identity,updater:result.updater?.status,original:result.original}));
}
