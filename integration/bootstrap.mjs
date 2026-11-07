// Stable entry point. Only a locally pinned signing key may authorize executable updates.
import {readFile,writeFile,open,unlink,mkdir,access} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {readJson,atomicJson} from './compatibility.mjs';
import {safeVersion,verifyVersion,activate} from './release-store.mjs';

const installRoot=dirname(fileURLToPath(import.meta.url));
const testAt=process.argv.indexOf('--test-profile'),testRoot=testAt>=0?resolve(process.argv[testAt+1]):null;
const stateRoot=testRoot||installRoot,started=performance.now();await mkdir(stateRoot,{recursive:true});
const maintenance=process.argv.includes('--diagnose')||process.argv.includes('--restore')||process.argv.includes('--update-only');
const lockPath=join(stateRoot,'bootstrap.lock');let ownsLock=false;
const alive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};
function original(){if(testRoot)return;const child=spawn('explorer.exe',['shell:AppsFolder\\OpenAI.Codex_2p2nqsd0c76g0!App'],{windowsHide:true,detached:true,stdio:'ignore'});child.on('error',()=>{});child.unref();}
try{
 if(!maintenance){
  const old=await readJson(lockPath,null);
  if(old?.pid&&alive(old.pid)){const state=await readJson(join(stateRoot,'state.json'),{});if(state.mounted)original();process.exit(0);}
  if(old)await unlink(lockPath).catch(()=>{});
  try{const lock=await open(lockPath,'wx');await lock.writeFile(JSON.stringify({pid:process.pid}));await lock.close();ownsLock=true;}catch(error){if(error.code==='EEXIST')process.exit(0);throw error;}
 }
 const publicKey=await readFile(join(installRoot,'release-public.pem'),'utf8');
 let pointer=await readJson(join(stateRoot,'current.json'),null)||await readJson(join(installRoot,'current.json'),null);safeVersion(pointer?.version);
 async function versionDirectory(version){const staged=join(stateRoot,'versions',safeVersion(version));try{await access(staged);return staged;}catch{return join(installRoot,'versions',version);}}
 const attempt=await readJson(join(stateRoot,'boot-status.json'),null);
 if(!maintenance&&attempt?.version===pointer.version&&!attempt.ready&&pointer.previous&&!alive(attempt.pid)){
  const previous=await verifyVersion(await versionDirectory(pointer.previous),publicKey);
  await atomicJson(join(stateRoot,'update-state.json'),{rejectedVersion:pointer.version,reason:'interrupted-startup'});
  pointer=await activate(stateRoot,previous.manifest.version);
 }
 let current;
 try{current=await verifyVersion(await versionDirectory(pointer.version),publicKey);}catch(error){
  if(!pointer.previous)throw error;
  current=await verifyVersion(await versionDirectory(pointer.previous),publicKey);
  await activate(stateRoot,current.manifest.version);
 }
 const manager=await import(pathToFileURL(join(current.directory,'manager.mjs')));
 await manager.runManager({installRoot,stateRoot,testRoot,current,publicKey,started,args:process.argv.slice(2)});
}catch(error){
 await writeFile(join(stateRoot,'bootstrap-error.log'),new Date().toISOString()+' '+String(error.stack||error)).catch(()=>{});
 console.error(error.message);original();process.exitCode=1;
}finally{
 if(ownsLock){const owner=await readJson(lockPath,null);if(owner?.pid===process.pid)await unlink(lockPath).catch(()=>{});}
}
