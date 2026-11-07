// Requires a published win-v0.5.0 release and a local signed 0.4.99 fixture bundle.
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
import {readJson} from './compatibility.mjs';
import {verifyVersion} from './release-store.mjs';
const run=promisify(execFile),output=resolve('integration/verification','online-update-'+Date.now()),install=join(output,'install'),profile=join(output,'profile');
await mkdir(profile,{recursive:true});
await run(process.execPath,['integration/install-release.mjs','--test-install','--root',install,'--bundle',resolve('integration/dist/0.4.99')],{windowsHide:true});
await writeFile(join(profile,'config.json'),JSON.stringify({enabled:true,language:'en',sound:false,autoUpdate:true}));
const args=[join(install,'bootstrap.mjs'),'--test-profile',profile],result={passed:false};let child,pid;
try{
 result.update=JSON.parse((await run(process.execPath,[...args,'--update-only'],{windowsHide:true,timeout:120000})).stdout);
 assert.equal(result.update.version,'0.5.0');assert.equal(result.update.compatibilityCached,false);
 const pointer=await readJson(join(profile,'current.json'),null);assert.deepEqual(pointer,{version:'0.5.0',previous:'0.4.99'});
 const key=await readFile(join(install,'release-public.pem'),'utf8');await verifyVersion(join(profile,'versions','0.5.0'),key);
 result.pointer=pointer;result.downloadedSignatureVerified=true;
 child=spawn(process.execPath,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});let logs='';for(const stream of [child.stdout,child.stderr])stream.on('data',d=>logs+=d);
 const waitFor=async test=>{for(let i=0;i<450;i++){const state=await readJson(join(profile,'state.json'),{});if(state.pid)pid=state.pid;if(test(state))return state;if(child.exitCode!==null)throw Error('Launcher ended: '+logs);await delay(100);}throw Error('Launcher state timeout');};
 result.mounted=await waitFor(s=>s.mounted===true);assert.equal(result.mounted.themeRelease,'0.5.0');
 await run(process.execPath,[...args,'--restore'],{windowsHide:true});await waitFor(s=>s.mounted===false&&s.themeEnabled===false);
 result.restored=true;result.passed=true;
}catch(error){result.error=error.stack;process.exitCode=1;}
finally{
 if(pid)await run('taskkill.exe',['/PID',String(pid),'/T','/F'],{windowsHide:true}).catch(()=>{});
 if(child){for(let i=0;i<40&&child.exitCode===null;i++)await delay(100);if(child.exitCode===null)child.kill();}
 await writeFile(join(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({output,...result}));
}
