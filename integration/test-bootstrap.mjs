// Boot real bootstrap code with locally signed, inert fixture managers.
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {generateKeyPairSync,sign} from 'node:crypto';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {digest,activate} from './release-store.mjs';
import {readJson,atomicJson} from './compatibility.mjs';
const root=await mkdtemp(join(tmpdir(),'linker-bootstrap-test-')),{privateKey,publicKey}=generateKeyPairSync('ed25519');
for(const name of ['bootstrap.mjs','release-store.mjs','compatibility.mjs'])await copyFile('integration/'+name,join(root,name));
await writeFile(join(root,'release-public.pem'),publicKey.export({type:'spki',format:'pem'}));
for(const version of ['0.5.0','0.5.1']){
 const dir=join(root,'versions',version);await mkdir(dir,{recursive:true});
 const contents={'manager.mjs':"import {writeFile} from 'node:fs/promises';import {join} from 'node:path';export async function runManager({stateRoot,current}){await writeFile(join(stateRoot,'observed.json'),JSON.stringify({version:current.manifest.version}));}",'launcher.mjs':'fixture','runtime.js':'fixture','ProgressWindow.exe':'fixture','shell-contract.json':'{}'};
 const files={};for(const [name,text] of Object.entries(contents)){const b=Buffer.from(text);files[name]={sha256:digest(b),bytes:b.length};await writeFile(join(dir,name),b);}
 const asset={url:'https://github.com/aswdxctsky-hub/linker-codex-theme/releases/download/win-v'+version+'/fixture',bytes:1,sha256:'a'.repeat(64)};
 const payload=JSON.stringify({schema:1,version,platform:'win32-x64',bootstrapProtocol:1,files,package:asset,media:{...asset,contentSha256:'a'.repeat(64),contentBytes:1}});
 await writeFile(join(dir,'release.json'),JSON.stringify({payload,signature:sign(null,Buffer.from(payload),privateKey).toString('base64')}));
}
const run=()=>promisify(execFile)(process.execPath,[join(root,'bootstrap.mjs'),'--test-profile',root],{windowsHide:true});
await activate(root,'0.5.0');await activate(root,'0.5.1');await atomicJson(join(root,'boot-status.json'),{version:'0.5.1',pid:2147483647,ready:false});
await run();assert.equal((await readJson(join(root,'observed.json'),{})).version,'0.5.0');assert.equal((await readJson(join(root,'update-state.json'),{})).reason,'interrupted-startup');
assert.equal(await readJson(join(root,'bootstrap.lock'),null),null);
await activate(root,'0.5.1');await atomicJson(join(root,'boot-status.json'),{version:'0.5.1',ready:true});await writeFile(join(root,'versions','0.5.1','manager.mjs'),'tampered');
await run();assert.equal((await readJson(join(root,'observed.json'),{})).version,'0.5.0');
await atomicJson(join(root,'bootstrap.lock'),{pid:process.pid});await writeFile(join(root,'observed.json'),'{}');
await run();assert.deepEqual(await readJson(join(root,'observed.json'),null),{});
console.log(JSON.stringify({passed:true,interruptedActivationRollsBack:true,corruptRuntimeRollsBack:true,duplicateLaunchDoesNotStartSession:true}));
