import {open,readFile,mkdir,writeFile,stat,rm} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
import {readJson,atomicJson,sha256} from './compatibility.mjs';
import {digest} from './release-store.mjs';
import {launchPipe} from './pipe-client.mjs';
import {mountTheme} from './media-delivery.mjs';

const run=promisify(execFile);
export const SHELL_SELECTORS=['WorkspaceContent-dnr6uY','MainContentViewport-OinMfT','LeftPanel-e8ghK3','ComposerLayoutRoot-XCKS7O','data-app-shell-main-surface'];
export async function archiveIdentity(path){const s=await stat(path,{bigint:true});return {path,size:String(s.size),mtime:String(s.mtimeNs),ctime:String(s.ctimeNs),ino:String(s.ino)};}
function same(a,b){return a&&b&&Object.keys(b).every(k=>a[k]===b[k]);}
export async function shellFingerprint(path){
 const file=await open(path,'r');
 try{
  const first=Buffer.alloc(16);await file.read(first,0,16,0);const headerSize=first.readUInt32LE(4),jsonSize=first.readUInt32LE(12);
  if(jsonSize>32*1024*1024||jsonSize<2||headerSize<jsonSize)throw Error('Unsupported application archive');
  const header=Buffer.alloc(jsonSize);await file.read(header,0,jsonSize,16);const tree=JSON.parse(header.toString()),base=8+headerSize;
  function* walk(node,prefix=''){for(const [name,value] of Object.entries(node.files||{})){const full=prefix+name;if(value.files)yield* walk(value,full+'/');else yield [full,value];}}
  const entries=[...walk(tree)];if(!entries.some(([name])=>name==='webview/index.html'))throw Error('Application entry changed');
  const groups=Object.fromEntries(SHELL_SELECTORS.map(n=>[n,new Set()]));
  for(const [name,entry] of entries){
   if(!name.startsWith('webview/')||!name.endsWith('.css')||entry.unpacked)continue;
   if(entry.size>16*1024*1024)throw Error('Stylesheet exceeds contract limit');
   const buffer=Buffer.alloc(entry.size);await file.read(buffer,0,entry.size,base+Number(entry.offset));const css=buffer.toString();
   if(!SHELL_SELECTORS.some(n=>css.includes(n)))continue;
   for(const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)){
    if(!/background|--composer-layout-surface|display|position|isolation|clip-path|pointer-events/.test(match[2]))continue;
    for(const selector of SHELL_SELECTORS)if(match[1].includes(selector))groups[selector].add(match[0]);
   }
  }
  return Object.fromEntries(Object.entries(groups).map(([name,rules])=>[name,{count:rules.size,sha256:digest(Buffer.from([...rules].sort().join('\n')))}]));
 }finally{await file.close();}
}
export function checkContract(actual,contract){
 if(contract?.schema!==1||!contract.selectors)throw Error('Shell contract missing');
 for(const selector of SHELL_SELECTORS){const value=actual[selector];if(!value?.count||!contract.selectors[selector]?.includes(value.sha256))throw Error('Application layout changed: '+selector);}
 return true;
}
export async function cachedCompatibility(root,pkg,release){
 if(pkg.family!=='OpenAI.Codex_2p2nqsd0c76g0')return null;
 const identity=await archiveIdentity(join(pkg.path,'app','resources','app.asar'));
 const cache=await readJson(join(root,'local-compatibility.json'),{records:[]});
 const key=digest(Buffer.from(release.envelope.payload));
 const record=cache.records.find(r=>r.packageVersion===pkg.version&&r.release===key&&same(r.identity,identity));
 return record||null;
}
export async function ensureCompatible({root,pkg,release,mediaPath,ui,signal,force=false}){
 if(pkg.family!=='OpenAI.Codex_2p2nqsd0c76g0')throw Error('Unexpected application package');
 if(!force){const cached=await cachedCompatibility(root,pkg,release);if(cached)return {...cached,cached:true};}
 signal?.throwIfAborted();ui?.update({title:'正在验证',english:'Verifying',detail:'检查应用兼容性',progress:null});
 const archive=join(pkg.path,'app','resources','app.asar'),identity=await archiveIdentity(archive);
 const [fingerprint,appHash,contract]=await Promise.all([shellFingerprint(archive),sha256(archive),readJson(join(release.directory,'shell-contract.json'),null)]);
 checkContract(fingerprint,contract);signal?.throwIfAborted();
 const testRoot=join(root,'probes',Date.now()+'-'+process.pid),profile=join(testRoot,'browser'),data=join(testRoot,'codex');
 await mkdir(profile,{recursive:true});await mkdir(data,{recursive:true});
 ui?.update({title:'正在验证',english:'Verifying',detail:'确认连接与界面恢复',progress:null});
 const client=launchPipe(join(pkg.path,'app','ChatGPT.exe'),['--user-data-dir='+profile,'--no-first-run'],{CODEX_ELECTRON_USER_DATA_PATH:profile,CODEX_HOME:data,CODEX_SQLITE_HOME:join(data,'sqlite')});
 ui?.update({probePid:client.child.pid});const result={passed:false,pid:client.child.pid};
 const cancel=()=>{if(!client.closed)void run('taskkill.exe',['/PID',String(client.child.pid),'/T','/F'],{windowsHide:true}).catch(()=>{});};signal?.addEventListener('abort',cancel,{once:true});
 const until=async(fn,message)=>{const end=Date.now()+30000;while(Date.now()<end){signal?.throwIfAborted();const value=await fn();if(value)return value;await delay(100);}throw Error(message);};
 const measure="(()=>({attribute:document.documentElement.getAttribute('data-linker-pearl'),background:getComputedStyle(document.body).backgroundImage,nodes:document.querySelectorAll('[id^=linker-pearl-v4-]').length}))()";
 try{
  result.browser=await client.call('Browser.getVersion');
  const target=await until(async()=>(await client.call('Target.getTargets')).targetInfos.find(t=>t.type==='page'&&/^app:\/\/-\/index\.html(?:[?#]|$)/.test(t.url)),'Main page unavailable');
  const session=(await client.call('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
  await until(()=>client.evaluate(session,"document.readyState==='complete'&&!!document.getElementById('root')&&Array.from(document.querySelectorAll('button')).some(b=>b.getBoundingClientRect().width>0)"),'Application did not become ready');
  const before=await client.evaluate(session,measure),runtime=await readFile(join(release.directory,'runtime.js'),'utf8'),media=JSON.parse(await readFile(mediaPath,'utf8'));
  const {mounted,delivery}=await mountTheme(client,session,runtime,media,{binding:'__linker_compatibility_probe',config:{language:'zh',sound:false},playIntro:true});
  if(!mounted?.installed)throw Error('Theme mount failed');
  await until(async()=>(await client.evaluate(session,'window.__linkerThemeV4?.status()')).introStage==='ready','Theme did not become ready');
  await delivery;signal?.throwIfAborted();
  await client.evaluate(session,'window.__linkerThemeV4.dispose();true');
  const restored=await client.evaluate(session,measure);
  if(JSON.stringify(restored)!==JSON.stringify(before))throw Error('Theme did not restore the native page');
  result.passed=true;
 }catch(error){result.error=error.message;throw error;}
 finally{
  signal?.removeEventListener('abort',cancel);if(!client.closed)await run('taskkill.exe',['/PID',String(client.child.pid),'/T','/F'],{windowsHide:true}).catch(()=>{});
  client.disconnect();ui?.update({probePid:0});await writeFile(join(testRoot,'result.json'),JSON.stringify(result,null,2));
  // Delete only the two generated profiles inside this owned probe directory.
  for(const generated of [profile,data]){const target=resolve(generated);if(!target.startsWith(resolve(root,'probes')+sep)||!target.startsWith(resolve(testRoot)+sep))throw Error('Unexpected probe cleanup path');await rm(target,{recursive:true,force:true,maxRetries:3,retryDelay:100}).catch(()=>{});}
 }
 if(!same(identity,await archiveIdentity(archive)))throw Error('Application changed during verification');
 const record={packageVersion:pkg.version,release:digest(Buffer.from(release.envelope.payload)),identity,appAsarSha256:appHash,verifiedAt:new Date().toISOString(),method:'shell-contract-and-isolated-runtime'};
 const path=join(root,'local-compatibility.json'),cache=await readJson(path,{records:[]});
 await atomicJson(path,{records:[record,...cache.records.filter(r=>!(r.packageVersion===record.packageVersion&&r.release===record.release))].slice(0,12)});
 return {...record,cached:false};
}
