import assert from 'node:assert/strict';
import {mkdir,copyFile,writeFile,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
import {sha256,readJson} from './compatibility.mjs';
const run=promisify(execFile),output=resolve('integration/verification','launcher-'+Date.now()),install=join(output,'install'),profile=join(output,'profile');
await mkdir(install,{recursive:true});await mkdir(profile,{recursive:true});
const sources=['launcher.mjs','windows-context.mjs','compatibility.mjs','compatibility.json','media-delivery.mjs','pipe-client.mjs','windows-processes.mjs','entrypoints.ps1','notice.vbs','ShortcutIdentity.cs'];
for(const file of sources)await copyFile(join('integration',file),join(install,file));
for(const file of ['runtime.js','media.json'])await copyFile(join('integration/bundle',file),join(install,file));
const files={};for(const file of [...sources,'runtime.js','media.json'])files[file]=await sha256(join(install,file));
await writeFile(join(install,'manifest.json'),JSON.stringify({schema:2,files}));
await writeFile(join(profile,'config.json'),JSON.stringify({enabled:true,language:'en',sound:false}));
const args=[join(install,'launcher.mjs'),'--test-profile',profile];
const result={passed:false};let child,pid;
try{
 for(const kind of ['first','cached']){const start=performance.now(),{stdout}=await run(process.execPath,[...args,'--diagnose'],{windowsHide:true});result[kind]={...JSON.parse(stdout),wallMs:Math.round(performance.now()-start)};assert.equal(result[kind].supported,true);}
 assert.equal(result.first.archiveCached,false);assert.equal(result.cached.archiveCached,true);
 child=spawn(process.execPath,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});let logs='';for(const stream of [child.stdout,child.stderr])stream.on('data',d=>logs+=d);
 async function waitFor(test){for(let i=0;i<400;i++){const state=await readJson(join(profile,'state.json'),{});if(state.pid)pid=state.pid;if(test(state))return state;if(child.exitCode!==null)throw Error('Launcher ended: '+logs);await delay(100);}throw Error('Launcher state timeout: '+logs);}
 result.mounted=await waitFor(s=>s.mounted===true);assert.equal(result.mounted.reason,null);assert.equal(result.mounted.archiveCached,true);
 await run(process.execPath,[...args,'--restore'],{windowsHide:true});
 result.restored=await waitFor(s=>s.mounted===false&&s.themeEnabled===false);
 const config=await readJson(join(profile,'config.json'),{});assert.equal(config.enabled,false);assert.equal(config.language,'en');
 result.passed=true;
}catch(error){result.error=error.stack;process.exitCode=1;}
finally{
 // PID was written by the child launcher for this new isolated profile only.
 if(pid)await run('taskkill.exe',['/PID',String(pid),'/T','/F'],{windowsHide:true}).catch(()=>{});
 if(child){for(let i=0;i<30&&child.exitCode===null;i++)await delay(100);if(child.exitCode===null)child.kill();}
 await writeFile(join(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({output,...result}));
}
