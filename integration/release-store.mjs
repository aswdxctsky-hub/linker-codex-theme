import {readFile,writeFile,mkdir,rename,stat} from 'node:fs/promises';
import {createHash,verify} from 'node:crypto';
import {gunzip} from 'node:zlib';
import {promisify} from 'node:util';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {readJson,atomicJson,sha256} from './compatibility.mjs';

export const REPO='aswdxctsky-hub/linker-codex-theme';
export const LATEST_URL=`https://api.github.com/repos/${REPO}/releases?per_page=10`;
const unpack=promisify(gunzip),hex=/^[a-f0-9]{64}$/,versionPattern=/^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/;
export const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export function compareVersions(a,b){for(let i=0;i<3;i++){const n=Number(a.split('.')[i])-Number(b.split('.')[i]);if(n)return Math.sign(n);}return 0;}
export function safeVersion(value){if(!versionPattern.test(value))throw Error('Invalid release version');return value;}
export function decodeManifest(envelope,publicKey){
 if(typeof envelope?.payload!=='string'||envelope.payload.length>128*1024||typeof envelope.signature!=='string'||!verify(null,Buffer.from(envelope.payload),publicKey,Buffer.from(envelope.signature,'base64')))throw Error('Release signature is invalid');
 const value=JSON.parse(envelope.payload);safeVersion(value.version);
 if(value.schema!==1||value.platform!=='win32-x64'||value.bootstrapProtocol!==1||!value.files||Object.keys(value.files).length>60)throw Error('Unsupported release format');
 for(const [name,file] of Object.entries(value.files)){
  if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)||name.endsWith('.')||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)||name==='release.json'||!hex.test(file.sha256)||!Number.isSafeInteger(file.bytes)||file.bytes<1||file.bytes>4*1024*1024)throw Error('Invalid release file');
 }
 for(const required of ['manager.mjs','launcher.mjs','runtime.js','ProgressWindow.exe','shell-contract.json'])if(!value.files[required])throw Error('Release is incomplete');
 for(const asset of [value.package,value.media])if(!asset||!hex.test(asset.sha256)||!Number.isSafeInteger(asset.bytes)||asset.bytes<1||asset.bytes>64*1024*1024||typeof asset.url!=='string')throw Error('Invalid release asset');
 if(!hex.test(value.media.contentSha256)||!Number.isSafeInteger(value.media.contentBytes)||value.media.contentBytes<1||value.media.contentBytes>80*1024*1024)throw Error('Invalid media asset');
 return value;
}
export function validAssetUrl(url){
 const u=new URL(url);
 if(u.protocol!=='https:'||u.hostname!=='github.com'||!u.pathname.startsWith('/'+REPO+'/releases/download/'))throw Error('Untrusted release URL');
 return url;
}
export async function download(url,{maxBytes,expectedBytes,expectedHash,signal,onProgress=()=>{},fetcher=fetch,timeout=45000}={}){
 const response=await fetcher(url,{headers:{Accept:'application/octet-stream','User-Agent':'Linker-Codex-Theme'},signal:AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(timeout)])});
 if(!response.ok)throw Error('Download HTTP '+response.status);
 const reader=response.body.getReader(),chunks=[];let received=0;
 for(;;){const {done,value}=await reader.read();if(done)break;received+=value.length;if(received>maxBytes){await reader.cancel();throw Error('Download exceeds size limit');}chunks.push(value);onProgress({received,total:expectedBytes||null});}
 const bytes=Buffer.concat(chunks);
 if(expectedBytes&&bytes.length!==expectedBytes)throw Error('Incomplete download');
 if(expectedHash&&digest(bytes)!==expectedHash)throw Error('Downloaded file failed verification');
 return bytes;
}
export async function latestRelease(publicKey,{signal,fetcher=fetch}={}){
 for(let attempt=0;attempt<2;attempt++){
  try{return await lookupRelease(publicKey,{signal,fetcher});}
  catch(error){if(signal?.aborted||attempt===1||!(['TypeError','TimeoutError','AbortError'].includes(error.name)||error.retryable))throw error;await delay(500,undefined,{signal});}
 }
}
async function lookupRelease(publicKey,{signal,fetcher}){
 const response=await fetcher(LATEST_URL,{headers:{Accept:'application/vnd.github+json','User-Agent':'Linker-Codex-Theme'},signal:AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(8000)])});
 if(response.status===404)return null;
 if(!response.ok){const error=Error('Release lookup HTTP '+response.status);error.retryable=response.status===429||response.status>=500;throw error;}
 const text=await response.text();if(text.length>512*1024)throw Error('Release metadata too large');
 const releases=JSON.parse(text);if(!Array.isArray(releases))throw Error('Invalid release index');
 const release=releases.filter(r=>!r.draft&&!r.prerelease&&/^win-v\d+\.\d+\.\d+$/.test(r.tag_name)&&r.assets?.some(a=>a.name==='linker-windows-release.json')).sort((a,b)=>compareVersions(b.tag_name.slice(5),a.tag_name.slice(5)))[0];
 if(!release)return null;
 const asset=release.assets.find(a=>a.name==='linker-windows-release.json');
 const bytes=await download(validAssetUrl(asset.browser_download_url),{maxBytes:128*1024,signal,fetcher,timeout:10000});
 const envelope=JSON.parse(bytes.toString('utf8')),manifest=decodeManifest(envelope,publicKey);
 if(release.tag_name!=='win-v'+manifest.version)throw Error('Release tag mismatch');
 validAssetUrl(manifest.package.url);validAssetUrl(manifest.media.url);
 return {envelope,manifest};
}
export async function verifyVersion(directory,publicKey){
 const envelope=JSON.parse(await readFile(join(directory,'release.json'),'utf8')),manifest=decodeManifest(envelope,publicKey);
 for(const [name,file] of Object.entries(manifest.files)){
  const path=join(directory,name),info=await stat(path);
  if(info.size!==file.bytes||await sha256(path)!==file.sha256)throw Error('Installed release failed verification: '+name);
 }
 return {envelope,manifest,directory};
}
export async function installRuntime(root,release,publicKey,options={}){
 const manifest=decodeManifest(release.envelope,publicKey),directory=join(root,'versions',manifest.version);
 const existing=await readJson(join(directory,'release.json'),null);
 if(existing){if(existing.payload!==release.envelope.payload)throw Error('A different release already uses this version');return verifyVersion(directory,publicKey);}
 const bytes=await download(validAssetUrl(manifest.package.url),{...options,maxBytes:16*1024*1024,expectedBytes:manifest.package.bytes,expectedHash:manifest.package.sha256});
 const packed=JSON.parse((await unpack(bytes,{maxOutputLength:12*1024*1024})).toString('utf8'));
 if(!packed.files||Object.keys(packed.files).sort().join('|')!==Object.keys(manifest.files).sort().join('|'))throw Error('Release contents mismatch');
 const stage=join(root,'versions','.staging-'+manifest.version+'-'+Date.now()+'-'+process.pid);
 await mkdir(stage,{recursive:true});
 for(const [name,file] of Object.entries(manifest.files)){
  if(typeof packed.files[name]!=='string')throw Error('Invalid file encoding');
  const value=Buffer.from(packed.files[name],'base64');
  if(value.length!==file.bytes||digest(value)!==file.sha256)throw Error('Release payload failed verification: '+name);
  await writeFile(join(stage,name),value,{flag:'wx'});
 }
 await writeFile(join(stage,'release.json'),JSON.stringify(release.envelope));
 await verifyVersion(stage,publicKey);
 await rename(stage,directory);
 return {...release,manifest,directory};
}
export async function prepareMedia(root,manifest,options={}){
 const directory=join(root,'media',manifest.media.contentSha256),path=join(directory,'media.json');
 const info=await stat(path).catch(()=>null),saved=await readJson(join(directory,'verified.json'),null);
 if(info&&saved?.sha256===manifest.media.contentSha256&&saved.size===info.size&&saved.mtimeMs===info.mtimeMs)return {directory,path,reused:true};
 await mkdir(directory,{recursive:true});
 if(!info||info.size!==manifest.media.contentBytes||await sha256(path)!==manifest.media.contentSha256){
  const compressed=await download(validAssetUrl(manifest.media.url),{...options,maxBytes:64*1024*1024,expectedBytes:manifest.media.bytes,expectedHash:manifest.media.sha256});
  const bytes=await unpack(compressed,{maxOutputLength:80*1024*1024});
  if(bytes.length!==manifest.media.contentBytes||digest(bytes)!==manifest.media.contentSha256)throw Error('Media verification failed');
  const temporary=path+'.tmp';await writeFile(temporary,bytes);await rename(temporary,path);
 }
 const data=JSON.parse(await readFile(path,'utf8'));
 for(const [name,key] of [['waiting-background.png','background'],['waiting-logo.png','logo']])await writeFile(join(directory,name),Buffer.from(data.images[key].split(',')[1],'base64'));
 const final=await stat(path);await atomicJson(join(directory,'verified.json'),{sha256:manifest.media.contentSha256,size:final.size,mtimeMs:final.mtimeMs});
 return {directory,path,reused:!!info};
}
export async function activate(root,version){
 safeVersion(version);const old=await readJson(join(root,'current.json'),null);
 if(old?.version===version)return old;
 const next={version,previous:old?.version||null};await atomicJson(join(root,'current.json'),next);return next;
}
