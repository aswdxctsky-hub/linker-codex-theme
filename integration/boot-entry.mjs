import {unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {acquireInstance} from './instance-lock.mjs';
import {readJson,atomicJson} from './compatibility.mjs';
import {verifyVersion,activate} from './release-store.mjs';

export async function runBoot(context){
 let {installRoot,stateRoot,testRoot,current,publicKey,pointer,args,log,entryRelease}=context;
 const readOnly=args.includes('--diagnose')||args.includes('--restore');
 let instance,ready=false;
 try{
  if(!readOnly){
   instance=await acquireInstance(stateRoot,async()=>{
    await log('duplicate-activation',ready?'ready':'starting');
    if(ready&&!testRoot){const child=spawn('explorer.exe',['shell:AppsFolder\\OpenAI.Codex_2p2nqsd0c76g0!App'],{windowsHide:true,detached:true,stdio:'ignore'});child.on('error',()=>{});child.unref();}
   });
   if(!instance.owned){await log('existing-instance',JSON.stringify(instance.owner));if(args.includes('--update-only'))console.log(JSON.stringify({updated:false,deferred:true,reason:'active-launcher'}));return;}
   await log('instance-acquired',JSON.stringify({pid:process.pid,sessionId:instance.sessionId,entryRelease}));
   const old=await readJson(join(stateRoot,'bootstrap.lock'),null);
   if(old)await log('legacy-lock-ignored',JSON.stringify(old));
   await unlink(join(stateRoot,'bootstrap.lock')).catch(error=>{if(error.code!=='ENOENT')throw error;});
   await atomicJson(join(stateRoot,'instance.json'),{pid:process.pid,sessionId:instance.sessionId,entryRelease,startedAt:new Date().toISOString()});
   await atomicJson(join(stateRoot,'state.json'),{running:false,mounted:false,pid:null,launcherPid:process.pid,sessionId:instance.sessionId,reason:'starting'});
   // Holding the endpoint proves no previous owner survives, even if its PID was reused.
   const attempt=await readJson(join(stateRoot,'boot-status.json'),null);
   if(context.verificationRollback){await activate(stateRoot,current.manifest.version);await log('rollback','release-verification');}
   else if(attempt?.version===current.manifest.version&&!attempt.ready&&pointer.previous){
    current=await verifyVersion(await context.versionDirectory(pointer.previous),publicKey);
    await atomicJson(join(stateRoot,'update-state.json'),{rejectedVersion:attempt.version,reason:'interrupted-startup'});
    await activate(stateRoot,current.manifest.version);await log('rollback','interrupted-startup');
   }
  }
  await log('entry-selected',entryRelease);
  const manager=await import(pathToFileURL(join(current.directory,'manager.mjs')));
  await manager.runManager({...context,current,entryRelease,onSessionReady:()=>{ready=true;}});
 }finally{
  if(instance?.owned){
   const state=await readJson(join(stateRoot,'state.json'),{});
   await atomicJson(join(stateRoot,'state.json'),{...state,running:false,mounted:false,launcherPid:null}).catch(()=>{});
   await unlink(join(stateRoot,'instance.json')).catch(()=>{});
   await log('instance-released',instance.sessionId).catch(()=>{});await instance.close();
  }
 }
}
