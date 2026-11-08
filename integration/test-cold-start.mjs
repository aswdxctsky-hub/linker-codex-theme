// Real official client: persisted prior-boot state, process-tree termination, restart.
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
import {readJson,atomicJson} from './compatibility.mjs';
const run=promisify(execFile),root=resolve('integration/verification/cold-start-'+Date.now()),install=join(root,'install'),profile=join(root,'profile');
await mkdir(profile,{recursive:true});
await run(process.execPath,['integration/install-release.mjs','--test-install','--root',install],{windowsHide:true});
await atomicJson(join(profile,'config.json'),{enabled:true,language:'en',sound:false,autoUpdate:false});
const args=[join(install,'bootstrap.mjs'),'--test-profile',profile,'--no-ui'],result={passed:false,wholeMachineReboot:false,boots:[]};
let child,appPid,logs='';
async function waitFor(fn){for(let i=0;i<600;i++){const state=await readJson(join(profile,'state.json'),{});if(state.pid&&state.launcherPid===child?.pid)appPid=state.pid;if(await fn(state))return state;if(child&&child.exitCode!==null)throw Error('Unexpected launcher exit '+logs);await delay(100);}throw Error('Real startup timed out '+logs);}
async function launch(){appPid=null;logs='';child=spawn(process.execPath,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});for(const stream of [child.stdout,child.stderr])stream.on('data',d=>logs+=d);const state=await waitFor(s=>s.mounted===true&&s.launcherPid===child.pid);assert.equal(state.themeRelease,'0.6.0');result.boots.push({pid:state.pid,launcherPid:state.launcherPid,packageVersion:state.packageVersion,timings:state.timings});}
async function endTree(){const owned=child;await run('taskkill.exe',['/PID',String(owned.pid),'/T','/F'],{windowsHide:true});for(let i=0;i<100&&owned.exitCode===null&&owned.signalCode===null;i++)await delay(50);assert.ok(owned.exitCode!==null||owned.signalCode!==null);child=null;appPid=null;}
try{
 result.probe=JSON.parse((await run(process.execPath,[...args,'--update-only'],{windowsHide:true,timeout:120000})).stdout);
 // A real live unrelated PID plus old mounted flags reproduces the reported residual state.
 await atomicJson(join(profile,'bootstrap.lock'),{pid:process.pid});await atomicJson(join(profile,'state.json'),{mounted:true,running:true,pid:process.pid,launcherPid:process.pid});await atomicJson(join(profile,'instance.json'),{pid:process.pid,sessionId:'previous-boot'});
 await launch();result.reusedPidRealStartup=true;
 await endTree();assert.equal((await readJson(join(profile,'state.json'),{})).mounted,true);result.abruptExitLeftResidualState=true;
 await launch();result.abruptExitRecovered=true;
 const heldPid=child.pid;await run(process.execPath,args,{windowsHide:true});assert.equal((await readJson(join(profile,'state.json'),{})).launcherPid,heldPid);result.repeatClickKeptOwner=true;
 await endTree();await launch();result.secondAbruptExitRecovered=true;
 await run(process.execPath,[...args,'--restore'],{windowsHide:true});await waitFor(s=>s.mounted===false&&s.themeEnabled===false);result.restoreStillWorks=true;
 await run('taskkill.exe',['/PID',String(appPid),'/T','/F'],{windowsHide:true});appPid=null;
 for(let i=0;i<100&&child.exitCode===null;i++)await delay(50);assert.equal(child.exitCode,0);child=null;
 assert.equal(await readJson(join(profile,'instance.json'),null),null);result.normalExitReleasedEndpoint=true;result.passed=true;
}catch(error){result.error=error.stack;process.exitCode=1;}
finally{if(child&&child.exitCode===null)await endTree().catch(()=>{});await writeFile(join(root,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({root,...result},null,2));}
