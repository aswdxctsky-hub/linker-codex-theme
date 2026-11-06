import {launchPipe} from './pipe-client.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
const root=resolve('integration/test-profile'),profile=join(root,'browser'),data=join(root,'codex');
await mkdir(profile,{recursive:true});await mkdir(data,{recursive:true});
const exe=process.argv[2];
const client=launchPipe(exe,['--user-data-dir='+profile,'--no-first-run'],{CODEX_ELECTRON_USER_DATA_PATH:profile,CODEX_HOME:data,CODEX_SQLITE_HOME:join(data,'sqlite')});
let result={pid:client.child.pid,profile};
try{
 result.version=await client.call('Browser.getVersion');let target;
 for(let i=0;i<140;i++){target=(await client.call('Target.getTargets')).targetInfos.find(t=>t.type==='page'&&t.url==='app://-/index.html');if(target)break;await delay(250);}
 if(!target)throw Error('Official main page not found');
 const {sessionId}=await client.call('Target.attachToTarget',{targetId:target.targetId,flatten:true});
 for(let i=0;i<140;i++){if(await client.evaluate(sessionId,"document.readyState==='complete'&&Array.from(document.querySelectorAll('button')).some(b=>b.getBoundingClientRect().width>0)"))break;await delay(250);}
 result.shell=await client.evaluate(sessionId,`(()=>{const s=getComputedStyle(document.documentElement);const vars={};for(let i=0;i<s.length;i++){let n=s[i];if(n.startsWith('--')&&/(surface|text-primary|text-secondary|bg-primary|bg-secondary|sidebar|foreground|background|border|color-scheme)/.test(n))vars[n]=s.getPropertyValue(n);}return{url:location.href,title:document.title,vars,root:{html:document.documentElement.className,body:document.body.className,root:document.getElementById('root')?.className,children:Array.from(document.getElementById('root')?.children||[]).map(e=>({tag:e.tagName,id:e.id,class:e.className}))},sheets:Array.from(document.styleSheets).map(s=>s.href).filter(Boolean)}})()`);
 const shot=await client.call('Page.captureScreenshot',{format:'png'},sessionId);await writeFile('integration/research/native-before.png',Buffer.from(shot.data,'base64'));
 await writeFile('integration/research/native-shell.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify(result));
}catch(e){console.log(JSON.stringify({error:e.message,logTail:client.logTail}));process.exitCode=1;}
finally{try{execFileSync('taskkill.exe',['/PID',String(client.child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}catch{}client.disconnect();}
