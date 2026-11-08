// Minimal trust loader. Startup policy lives in the signed, versioned boot-entry.
import {readFile,writeFile,appendFile,mkdir,access} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {readJson} from './compatibility.mjs';
import {safeVersion,verifyVersion} from './release-store.mjs';
const installRoot=dirname(fileURLToPath(import.meta.url)),args=process.argv.slice(2),started=performance.now();
const testAt=args.indexOf('--test-profile'),testRoot=testAt>=0?resolve(args[testAt+1]):null,stateRoot=testRoot||installRoot;
await mkdir(stateRoot,{recursive:true});
const log=(event,detail='')=>appendFile(join(stateRoot,'bootstrap.log'),new Date().toISOString()+' '+event+' '+detail+'\n');
async function versionDirectory(version){safeVersion(version);const staged=join(stateRoot,'versions',version);try{await access(staged);return staged;}catch{return join(installRoot,'versions',version);}}
try{
 await log('entry-request',JSON.stringify({pid:process.pid,args}));
 const publicKey=await readFile(join(installRoot,'release-public.pem'),'utf8');
 const pointer=await readJson(join(stateRoot,'current.json'),null)||await readJson(join(installRoot,'current.json'),null);
 let current,verificationRollback=false;
 try{current=await verifyVersion(await versionDirectory(pointer?.version),publicKey);}catch(error){
  if(!pointer?.previous)throw error;
  current=await verifyVersion(await versionDirectory(pointer.previous),publicKey);verificationRollback=true;
  await log('release-verification-fallback',error.message);
 }
 let entry=current.manifest.files['boot-entry.mjs']?current:await verifyVersion(join(installRoot,'bootstrap-core'),publicKey);
 let module;
 try{module=await import(pathToFileURL(join(entry.directory,'boot-entry.mjs')));if(typeof module.runBoot!=='function')throw Error('Missing startup entry');}
 catch(error){await log('entry-import-fallback',error.message);entry=await verifyVersion(join(installRoot,'bootstrap-core'),publicKey);module=await import(pathToFileURL(join(entry.directory,'boot-entry.mjs')));}
 await module.runBoot({installRoot,stateRoot,testRoot,args,started,current,publicKey,pointer,verificationRollback,versionDirectory,entryRelease:entry.manifest.version,log});
}catch(error){
 await log('entry-failed',String(error.stack||error)).catch(()=>{});
 await writeFile(join(stateRoot,'bootstrap-error.log'),new Date().toISOString()+' '+String(error.stack||error)).catch(()=>{});
 console.error(error.message);process.exitCode=1;
 if(!testRoot){await log('original','entry-failed').catch(()=>{});const child=spawn('explorer.exe',['shell:AppsFolder\\OpenAI.Codex_2p2nqsd0c76g0!App'],{windowsHide:true,detached:true,stdio:'ignore'});child.on('error',()=>{});child.unref();}
}
