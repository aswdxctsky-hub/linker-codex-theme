import {readFile,writeFile,rename,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';

export const COMPATIBILITY_URL='https://raw.githubusercontent.com/aswdxctsky-hub/linker-codex-theme/main/integration/compatibility.json';
export const RUNTIME_REVISION=2;
const FAMILY='OpenAI.Codex_2p2nqsd0c76g0';
export async function readJson(path,fallback){try{return JSON.parse((await readFile(path,'utf8')).replace(/^\uFEFF/,''));}catch{return fallback;}}
export async function atomicJson(path,value){const temp=path+'.'+process.pid+'.tmp';await writeFile(temp,JSON.stringify(value,null,2));await rename(temp,path);}
export function validateCompatibility(value){
 if(value?.schema!==1||value.packageFamily!==FAMILY||!Array.isArray(value.builds)||value.builds.length>500)throw Error('Invalid compatibility catalog');
 for(const b of value.builds){
  if(!/^\d+\.\d+\.\d+\.\d+$/.test(b.version)||!/^\d+$/.test(String(b.runtimeRevision))||b.runtimeRevision<1||!/^([a-f0-9]{64})$/.test(b.appAsarSha256)||b.platform!=='win32-x64')throw Error('Invalid compatibility entry');
 }
 return value;
}
export async function findCompatibility(root,pkg,{online=true,fetcher=fetch}={}){
 if(pkg.family!==FAMILY)return {entry:null,source:'wrong-package'};
 const find=doc=>doc?.builds.find(b=>b.version===pkg.version&&b.platform==='win32-x64'&&b.runtimeRevision<=RUNTIME_REVISION);
 for(const file of ['compatibility.json','compatibility-cache.json']){
  try{const entry=find(validateCompatibility(await readJson(join(root,file),null)));if(entry)return {entry,source:file};}catch{}
 }
 if(!online)return {entry:null,source:'offline'};
 try{
  // A tiny data-only allowlist: never download or execute remote JavaScript or shell commands.
  const response=await fetcher(COMPATIBILITY_URL,{signal:AbortSignal.timeout(2500),redirect:'error',headers:{Accept:'application/json'}});
  if(!response.ok)throw Error('Compatibility HTTP '+response.status);
  const reader=response.body.getReader(),chunks=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>128*1024){await reader.cancel();throw Error('Compatibility catalog too large');}chunks.push(value);}
  const doc=validateCompatibility(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  await atomicJson(join(root,'compatibility-cache.json'),doc);
  return {entry:find(doc)||null,source:'github'};
 }catch(error){return {entry:null,source:'unavailable',error:error.message};}
}
export async function sha256(path){const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);return hash.digest('hex');}
export async function verifyArchive(path,expected,cachePath,{force=false}={}){
 const before=await stat(path,{bigint:true});
 const identity={path,size:String(before.size),mtime:String(before.mtimeNs),ctime:String(before.ctimeNs),ino:String(before.ino),expected};
 const cached=await readJson(cachePath,null);
 if(!force&&cached?.verified===true&&Object.keys(identity).every(k=>cached[k]===identity[k]))return {valid:true,cached:true};
 const digest=await sha256(path),after=await stat(path,{bigint:true});
 const valid=digest===expected&&before.size===after.size&&before.mtimeNs===after.mtimeNs&&before.ctimeNs===after.ctimeNs;
 if(valid)await atomicJson(cachePath,{...identity,verified:true});
 return {valid,cached:false};
}
