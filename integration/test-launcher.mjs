import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
import {readJson} from './compatibility.mjs';

const run=promisify(execFile),output=resolve('integration/verification','launcher-'+Date.now()),install=join(output,'install'),profile=join(output,'profile');
await mkdir(profile,{recursive:true});
await run(process.execPath,['integration/install-release.mjs','--test-install','--root',install],{windowsHide:true});
await writeFile(join(profile,'config.json'),JSON.stringify({enabled:true,language:'en',sound:false,autoUpdate:true}));
const offline=join(output,'offline.mjs');await writeFile(offline,"globalThis.fetch=async()=>{throw Error('Simulated network outage');};");
const args=['--import',pathToFileURL(offline).href,join(install,'bootstrap.mjs'),'--test-profile',profile];
const result={passed:false};let child,pid;
const invoke=async more=>JSON.parse((await run(process.execPath,[...args,...more],{windowsHide:true,timeout:90000})).stdout);
try{
 result.before=await invoke(['--diagnose']);assert.equal(result.before.localCompatibility,false);
 result.probe=await invoke(['--update-only']);assert.equal(result.probe.compatibilityCached,false);
 result.cached=await invoke(['--diagnose']);assert.equal(result.cached.localCompatibility,true);assert.equal(result.cached.autoUpdate,true);
 child=spawn(process.execPath,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});let logs='';for(const stream of [child.stdout,child.stderr])stream.on('data',d=>logs+=d);
 async function waitFor(test){for(let i=0;i<450;i++){const state=await readJson(join(profile,'state.json'),{});if(state.pid)pid=state.pid;if(test(state))return state;if(child.exitCode!==null)throw Error('Launcher ended: '+logs);await delay(100);}throw Error('Launcher state timeout: '+logs);}
 result.mounted=await waitFor(s=>s.mounted===true);assert.equal(result.mounted.reason,null);assert.equal(result.mounted.language,'en');assert.ok(result.mounted.timings.firstFeedbackMs>0);
 assert.match(await readFile(join(profile,'launcher.log'),'utf8'),/compatible [\d.]+ cached/);
 assert.match(await readFile(join(profile,'launcher.log'),'utf8'),/update-unavailable Simulated network outage/);
 await invoke(['--restore']);
 result.restored=await waitFor(s=>s.mounted===false&&s.themeEnabled===false);
 const config=await readJson(join(profile,'config.json'),{});assert.equal(config.enabled,false);assert.equal(config.language,'en');
 result.passed=true;
}catch(error){result.error=error.stack;process.exitCode=1;}
finally{
 // Only the PID recorded by this fixture's launcher belongs to this test.
 if(pid)await run('taskkill.exe',['/PID',String(pid),'/T','/F'],{windowsHide:true}).catch(()=>{});
 if(child){for(let i=0;i<40&&child.exitCode===null;i++)await delay(100);if(child.exitCode===null)child.kill();}
 await writeFile(join(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({output,...result}));
}
