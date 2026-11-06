// Exercise the real application in its own disposable profile; never touch the signed-in window.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {launchPipe} from './pipe-client.mjs';
import {mountTheme} from './media-delivery.mjs';

const exe=process.argv[2];
if(!exe?.includes('WindowsApps\\OpenAI.Codex_')||!exe.endsWith('\\app\\ChatGPT.exe'))throw Error('Provide the installed official Windows executable.');
const label=process.argv[3]||'current';
if(!/^[a-z0-9-]+$/.test(label))throw Error('Invalid test label');
const output=resolve('integration/verification',label+'-'+Date.now());
const profile=join(output,'browser'),data=join(output,'codex');
await mkdir(profile,{recursive:true});await mkdir(data,{recursive:true});
const start=performance.now(),result={label,timings:{},passed:false};
const mark=name=>result.timings[name]=Math.round(performance.now()-start);
const client=launchPipe(exe,['--user-data-dir='+profile,'--no-first-run'],{CODEX_ELECTRON_USER_DATA_PATH:profile,CODEX_HOME:data,CODEX_SQLITE_HOME:join(data,'sqlite')});
let session;
async function until(fn,message,timeout=45000){const end=Date.now()+timeout;while(Date.now()<end){const value=await fn();if(value)return value;await delay(100);}throw Error(message);}
const measure="(()=>({attribute:document.documentElement.getAttribute('data-linker-pearl'),background:getComputedStyle(document.body).backgroundImage==='none'?'none':'image',nodes:document.querySelectorAll('[id^=linker-pearl-v4-]').length,theme:window.__linkerThemeV4?.status()||null}))()";
async function screenshot(name){const r=await client.call('Page.captureScreenshot',{format:'png'},session);await writeFile(join(output,name+'.png'),Buffer.from(r.data,'base64'));}
try{
 result.browser=await client.call('Browser.getVersion');mark('pipeReady');
 const target=await until(async()=>(await client.call('Target.getTargets')).targetInfos.find(t=>t.type==='page'&&/^app:\/\/-\/index.html/.test(t.url)),'Main page missing');
 session=(await client.call('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
 await until(()=>client.evaluate(session,"document.readyState==='complete'&&!!document.getElementById('root')&&Array.from(document.querySelectorAll('button')).some(b=>b.getBoundingClientRect().width>0)"),'App not ready');mark('nativeReady');
 result.before=await client.evaluate(session,measure);
 const runtime=await readFile('integration/bundle/runtime.js','utf8'),media=JSON.parse(await readFile('integration/bundle/media.json','utf8'));
 mark('mediaRead');
 await client.evaluate(session,"window.__testShadows=[];window.__testAttachShadow=Element.prototype.attachShadow;Element.prototype.attachShadow=function(options){const s=window.__testAttachShadow.call(this,options);window.__testShadows.push(s);return s;};true");
 const settings={binding:'__linker_test',config:{language:label.includes('english')?'en':'zh',sound:false},playIntro:true};
 let delivery;
 if(label.startsWith('baseline'))result.mounted=await client.evaluate(session,runtime+'('+JSON.stringify({...settings,media})+')');
 else {const mounted=await mountTheme(client,session,runtime,media,settings);result.mounted=mounted.mounted;delivery=mounted.delivery;}
 mark('mounted');
 // Restore the production API; retain only test-owned shadow handles for hit testing.
 await client.evaluate(session,'Element.prototype.attachShadow=window.__testAttachShadow;true');
 assert.equal(result.mounted.installed,true);
 await until(async()=>(await client.evaluate(session,'window.__linkerThemeV4.status()')).introStage==='ready','Intro not ready');mark('introReady');
 await screenshot('ready');
 console.log(JSON.stringify({label,timings:result.timings}));
 // Canvas buttons remain keyboard accessible even though the overlay uses closed Shadow DOM.
 result.stages=[];
 for(let i=0;i<1200;i++){
  const s=await client.evaluate(session,'window.__linkerThemeV4.status()');
  if(result.stages.at(-1)!==s.introStage){result.stages.push(s.introStage);console.log(JSON.stringify({label,stage:s.introStage}));}
  if(!s.intro){assert.equal(s.lastIntroResult,'complete');break;}
  if(i%4===0){const box=await client.evaluate(session,"(()=>{const b=window.__testShadows.at(-1)?.getElementById('action');if(!b||b.hidden||b.disabled)return null;const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()");if(box){await client.call('Input.dispatchMouseEvent',{type:'mousePressed',...box,button:'left',clickCount:1},session);await client.call('Input.dispatchMouseEvent',{type:'mouseReleased',...box,button:'left',clickCount:1},session);}}
  await delay(100);
 }
 result.completed=await client.evaluate(session,'window.__linkerThemeV4.status()');assert.equal(result.completed.lastIntroResult,'complete');mark('flowComplete');
 if(delivery)await delivery;
 await screenshot('after');
 await client.evaluate(session,'window.__linkerThemeV4.replay();true');
 await until(async()=>(await client.evaluate(session,'window.__linkerThemeV4.status()')).introStage==='ready','Replay not ready');
 await client.call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},session);
 assert.equal((await client.evaluate(session,'window.__linkerThemeV4.status()')).lastIntroResult,'skipped');
 await client.evaluate(session,'window.__linkerThemeV4.dispose();true');
 result.restored=await client.evaluate(session,measure);assert.deepEqual(result.restored,result.before);
 result.passed=true;
}catch(e){result.error=e.stack;process.exitCode=1;}
finally{
 // The exact child PID belongs to this fresh, isolated profile only.
 try{execFileSync('taskkill.exe',['/PID',String(client.child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}catch{}
 client.disconnect();
 await writeFile(join(output,'result.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify({output,...result}));
}
