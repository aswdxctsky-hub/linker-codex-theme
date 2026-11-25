// Force a semantic incompatibility in a disposable fixture; verify the real fallback.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,cp} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {verifyVersion} from './release-store.mjs';
import {readJson} from './compatibility.mjs';
const root=resolve('integration/verification','manager-fallback-'+Date.now()),directory=join(root,'runtime'),profile=join(root,'profile');
await mkdir(profile,{recursive:true});
const publicKey=await readFile('integration/release-public.pem','utf8');
const signed=await verifyVersion(resolve('integration/dist/0.7.0/runtime'),publicKey);
await cp(signed.directory,directory,{recursive:true});
// Test-only contract injection happens after verification; never used by the trust loader.
await writeFile(join(directory,'shell-contract.json'),JSON.stringify({schema:2,capabilities:['missing-test-role']}));
const current={...signed,directory},media=join(root,'media',current.manifest.media.contentSha256);
await mkdir(media,{recursive:true});await cp('integration/bundle/media.json',join(media,'media.json'));
await writeFile(join(profile,'config.json'),JSON.stringify({enabled:true,autoUpdate:false,sound:false}));
const {runManager}=await import(pathToFileURL(join(directory,'manager.mjs')));
const options={installRoot:root,stateRoot:profile,testRoot:profile,current,publicKey,started:performance.now(),args:['--no-ui']};
let pid;const result={passed:false};
try{
 await runManager({...options,args:['--no-ui','--update-only']});
 result.updateOnly=await readJson(join(profile,'state.json'),{});
 assert.equal(result.updateOnly.reason,'compatibility-failed');assert.equal(result.updateOnly.pid,undefined);assert.equal(process.exitCode,1);process.exitCode=0;
 await runManager(options);const state=await readJson(join(profile,'state.json'),{});pid=state.pid;
 assert.equal(state.reason,'compatibility-failed');assert.ok(pid);assert.ok(state.packageIdentity.includes('_'+state.packageVersion+'_'));assert.equal(state.mounted,false);
 result.originalIdentity=state.packageIdentity;result.failedCheckDoesNotOpenApp=true;result.passed=true;
}catch(error){result.error=error.stack;process.exitCode=1;}
finally{
 if(pid)await promisify(execFile)('taskkill.exe',['/PID',String(pid),'/T','/F'],{windowsHide:true}).catch(()=>{});
 await writeFile(join(root,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({root,...result}));
}
