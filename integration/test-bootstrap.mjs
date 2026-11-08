// Exercise the actual Windows kernel endpoint and the signed startup loader.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,copyFile,cp,unlink,appendFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {generateKeyPairSync,sign} from 'node:crypto';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
import {digest,activate} from './release-store.mjs';
import {readJson,atomicJson} from './compatibility.mjs';
const root=resolve('integration/verification/bootstrap-'+Date.now());await mkdir(root,{recursive:true});
const {privateKey,publicKey}=generateKeyPairSync('ed25519');
for(const name of ['bootstrap.mjs','release-store.mjs','compatibility.mjs'])await copyFile('integration/'+name,join(root,name));
await writeFile(join(root,'release-public.pem'),publicKey.export({type:'spki',format:'pem'}));
const manager=`import {appendFile} from 'node:fs/promises';import {join} from 'node:path';import {atomicJson} from './compatibility.mjs';
export async function runManager({stateRoot,current,args,entryRelease,onSessionReady}){
 await atomicJson(join(stateRoot,'boot-status.json'),{version:current.manifest.version,pid:process.pid,ready:!args.includes('--fixture-unready')});
 await appendFile(join(stateRoot,'launches.txt'),process.pid+'\\n');
 await atomicJson(join(stateRoot,'observed.json'),{version:current.manifest.version,pid:process.pid,entryRelease});
 if(!args.includes('--fixture-unready'))onSessionReady?.();
 if(args.includes('--fixture-hold'))await new Promise(()=>setInterval(()=>{},1000));
}`;
for(const version of ['0.6.0','0.6.1','0.6.2']){
 const dir=join(root,'versions',version);await mkdir(dir,{recursive:true});
 const contents={'manager.mjs':manager,'launcher.mjs':'fixture','runtime.js':'fixture','ProgressWindow.exe':'fixture','shell-contract.json':'{}'};
 for(const name of ['boot-entry.mjs','instance-lock.mjs','compatibility.mjs','release-store.mjs'])contents[name]=await readFile('integration/'+name,'utf8');
 contents['boot-entry.mjs']=contents['boot-entry.mjs'].replace("await log('entry-selected',entryRelease);",`await log('entry-selected',entryRelease);await atomicJson(join(stateRoot,'entry-marker.json'),{codeVersion:'${version}'});`);
 if(version==='0.6.2')contents['boot-entry.mjs']='export invalid syntax;';
 const files={};for(const [name,text] of Object.entries(contents)){const b=Buffer.from(text);files[name]={sha256:digest(b),bytes:b.length};await writeFile(join(dir,name),b);}
 const asset={url:'https://github.com/aswdxctsky-hub/linker-codex-theme/releases/download/win-v'+version+'/fixture',bytes:1,sha256:'a'.repeat(64)};
 const payload=JSON.stringify({schema:1,version,platform:'win32-x64',bootstrapProtocol:1,files,package:asset,media:{...asset,contentSha256:'a'.repeat(64),contentBytes:1}});
 await writeFile(join(dir,'release.json'),JSON.stringify({payload,signature:sign(null,Buffer.from(payload),privateKey).toString('base64')}));
}
await cp(join(root,'versions','0.6.0'),join(root,'bootstrap-core'),{recursive:true});
const cli=[join(root,'bootstrap.mjs'),'--test-profile',root],run=more=>promisify(execFile)(process.execPath,[...cli,...more||[]],{windowsHide:true,timeout:15000});
const result={passed:false,wholeMachineReboot:false},children=[];
async function waitFor(fn){for(let i=0;i<100;i++){if(await fn())return;await delay(50);}throw Error('Fixture state timeout');}
async function hold(extra=[]){const child=spawn(process.execPath,[...cli,'--fixture-hold',...extra],{windowsHide:true,stdio:'ignore'});children.push(child);await waitFor(async()=>(await readJson(join(root,'observed.json'),{})).pid===child.pid);return child;}
async function kill(child){await promisify(execFile)('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true});await waitFor(()=>child.exitCode!==null||child.signalCode!==null);}
try{
 await activate(root,'0.6.0');
 // The exact live PID belongs to this test driver, never to a theme owner.
 for(const mounted of [true,false]){
  await atomicJson(join(root,'bootstrap.lock'),{pid:process.pid});await atomicJson(join(root,'state.json'),{mounted,running:true,launcherPid:process.pid});
  await run();assert.equal((await readJson(join(root,'observed.json'),{})).version,'0.6.0');assert.equal(await readJson(join(root,'bootstrap.lock'),null),null);assert.equal((await readJson(join(root,'state.json'),{})).mounted,false);
 }
 result.pidReuseAndStaleMountedFlags=true;
 // Replay retained files from a prior boot, including an interrupted activation with a reused PID.
 await activate(root,'0.6.1');await atomicJson(join(root,'boot-status.json'),{version:'0.6.1',pid:process.pid,ready:false});
 await atomicJson(join(root,'instance.json'),{pid:process.pid,sessionId:'previous-boot',startedAt:'2000-01-01T00:00:00Z'});
 await run();assert.equal((await readJson(join(root,'observed.json'),{})).version,'0.6.0');assert.equal((await readJson(join(root,'update-state.json'),{})).reason,'interrupted-startup');result.crossBootResidualRecovery=true;
 const owner=await hold();const before=(await readFile(join(root,'launches.txt'),'utf8')).trim().split('\n').length;
 await Promise.all(Array.from({length:8},()=>run()));
 assert.equal((await readFile(join(root,'launches.txt'),'utf8')).trim().split('\n').length,before);
 assert.equal((await readJson(join(root,'instance.json'),{})).pid,owner.pid);
 const deferred=JSON.parse((await run(['--update-only'])).stdout);assert.equal(deferred.deferred,true);result.concurrentLaunchesSingleOwner=true;
 await kill(owner);await run();assert.notEqual((await readJson(join(root,'observed.json'),{})).pid,owner.pid);result.forcedExitReleasesKernelLock=true;
 await activate(root,'0.6.1');const interrupted=await hold(['--fixture-unready']);await kill(interrupted);await run();assert.equal((await readJson(join(root,'observed.json'),{})).version,'0.6.0');result.killedActivationRollsBack=true;
 // Real release store download/verification path with an in-memory transport fixture.
 const {gzipSync}=await import('node:zlib');const {installRuntime}=await import('./release-store.mjs');
 const envelope=JSON.parse(await readFile(join(root,'versions','0.6.1','release.json'),'utf8'));const manifest=JSON.parse(envelope.payload);
 const packed={files:{}};for(const name of Object.keys(manifest.files))packed.files[name]=(await readFile(join(root,'versions','0.6.1',name))).toString('base64');
 const bytes=gzipSync(Buffer.from(JSON.stringify(packed)));manifest.package.bytes=bytes.length;manifest.package.sha256=digest(bytes);
 const payload=JSON.stringify(manifest),downloadedEnvelope={payload,signature:sign(null,Buffer.from(payload),privateKey).toString('base64')};
 const updateRoot=join(root,'downloaded');await mkdir(updateRoot);const downloaded=await installRuntime(updateRoot,{envelope:downloadedEnvelope},publicKey,{fetcher:async()=>new Response(bytes)});
 // Install that package into the profile, and keep the disk trust loader identical.
 const profile=join(root,'updated-profile');await mkdir(join(profile,'versions'),{recursive:true});await cp(downloaded.directory,join(profile,'versions','0.6.1'),{recursive:true});await activate(profile,'0.6.1');
 const loaderHash=digest(await readFile(join(root,'bootstrap.mjs')));
 await promisify(execFile)(process.execPath,[join(root,'bootstrap.mjs'),'--test-profile',profile],{windowsHide:true});
 assert.equal((await readJson(join(profile,'entry-marker.json'),{})).codeVersion,'0.6.1');assert.equal(digest(await readFile(join(root,'bootstrap.mjs'))),loaderHash);result.signedEntryUpdateWithoutReplacingLoader=true;
 await activate(root,'0.6.1');await atomicJson(join(root,'boot-status.json'),{version:'0.6.1',ready:true});await appendFile(join(root,'versions','0.6.1','boot-entry.mjs'),'\n// tampered');await run();
 assert.equal((await readJson(join(root,'entry-marker.json'),{})).codeVersion,'0.6.0');result.tamperedEntryRejected=true;
 await activate(root,'0.6.2');await run();assert.equal((await readJson(join(root,'entry-marker.json'),{})).codeVersion,'0.6.0');assert.match(await readFile(join(root,'bootstrap.log'),'utf8'),/entry-import-fallback/);result.brokenSignedEntryUsesRescue=true;
 assert.equal(await readJson(join(root,'instance.json'),null),null);result.passed=true;
}catch(error){result.error=error.stack;process.exitCode=1;}
finally{
 for(const child of children)if(child.exitCode===null&&child.signalCode===null)await kill(child).catch(()=>{});
 await writeFile(join(root,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({root,...result},null,2));
}
