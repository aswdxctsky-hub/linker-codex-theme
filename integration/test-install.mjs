import {launchPipe} from './pipe-client.mjs';
import {mkdir,writeFile,readFile,access,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
const root=resolve('integration/test-profile'),profile=join(root,'browser'),data=join(root,'codex'),output=resolve('integration/verification');
await mkdir(output,{recursive:true});await mkdir(profile,{recursive:true});await mkdir(data,{recursive:true});await rm(join(output,'finish-test'),{force:true});
const exe=process.argv[2],client=launchPipe(exe,['--user-data-dir='+profile,'--no-first-run'],{CODEX_ELECTRON_USER_DATA_PATH:profile,CODEX_HOME:data,CODEX_SQLITE_HOME:join(data,'sqlite')});
const result={pid:client.child.pid,profile,passed:false};let session;
const state=`(()=>({style:getComputedStyle(document.body).backgroundImage,attribute:document.documentElement.getAttribute('data-linker-pearl'),text:getComputedStyle(document.documentElement).getPropertyValue('--color-text-primary'),customNodes:document.querySelectorAll('[id^="linker-pearl-v4-"]').length,theme:window.__linkerThemeV4?.status()||null}))()`;
async function shot(name){const r=await client.call('Page.captureScreenshot',{format:'png'},session);await writeFile(join(output,name+'.png'),Buffer.from(r.data,'base64'));}
try{
 await client.call('Browser.getVersion');let target;
 for(let i=0;i<160;i++){target=(await client.call('Target.getTargets')).targetInfos.find(t=>t.type==='page'&&t.url==='app://-/index.html');if(target)break;await delay(250);}
 if(!target)throw Error('Main page missing');session=(await client.call('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
 for(let i=0;i<160;i++){if(await client.evaluate(session,"document.readyState==='complete'&&Array.from(document.querySelectorAll('button')).some(b=>b.getBoundingClientRect().width>0)"))break;await delay(250);}
 result.before=await client.evaluate(session,state);await shot('01-before');
 const runtime=await readFile('integration/bundle/runtime.js','utf8'),media=JSON.parse(await readFile('integration/bundle/media.json','utf8'));
 result.applied=await client.evaluate(session,runtime+'('+JSON.stringify({media,binding:'__linker_test_binding',config:{language:'zh',sound:false},playIntro:false})+')');
 await delay(400);await shot('02-theme');
 result.paint=await client.evaluate(session,`Array.from(document.querySelectorAll('#root *')).filter(e=>{const r=e.getBoundingClientRect();return r.width>innerWidth*.7&&r.height>innerHeight*.7}).map(e=>({tag:e.tagName,class:e.className,bg:getComputedStyle(e).backgroundColor,image:getComputedStyle(e).backgroundImage,style:e.getAttribute('style')}))`);await writeFile(join(output,'paint.json'),JSON.stringify(result.paint,null,2));
 await client.evaluate(session,'window.__linkerThemeV4.replay();true');
 for(let i=0;i<80;i++){const s=await client.evaluate(session,'window.__linkerThemeV4.status()');if(s.introStage==='ready')break;await delay(250);}
 await delay(500);result.introReady=await client.evaluate(session,'window.__linkerThemeV4.status()');await shot('03-intro');console.log(JSON.stringify({intro:result.introReady}));
 await writeFile(join(output,'active.json'),JSON.stringify({pid:client.child.pid,profile,ready:true},null,2));console.log(JSON.stringify({ready:true,pid:client.child.pid,output}));
 const until=Date.now()+180000;
 result.stages=[];let lastStage;
 while(Date.now()<until){try{await access(join(output,'finish-test'));break;}catch{}const now=await client.evaluate(session,'window.__linkerThemeV4?.status()');if(now?.introStage!==lastStage){lastStage=now?.introStage;result.stages.push(now);console.log(JSON.stringify({stage:now}));}await delay(500);}
 result.afterPlayback=await client.evaluate(session,'window.__linkerThemeV4.status()');await shot('04-after-playback');
 await client.evaluate(session,'window.__linkerThemeV4.dispose();true');await delay(300);
 result.restored=await client.evaluate(session,state);await shot('05-restored');
 result.passed=JSON.stringify(result.before)===JSON.stringify(result.restored);
 result.applied=result.applied?.installed&&result.introReady?.introStage==='ready';
 if(!result.passed||!result.applied)throw Error('Mount or restoration check failed');
}catch(e){result.error=e.message;process.exitCode=1;}
finally{try{execFileSync('taskkill.exe',['/PID',String(client.child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}catch{}client.disconnect();await writeFile(join(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({passed:result.passed,applied:result.applied,error:result.error,pid:result.pid}));}
