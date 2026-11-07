import {join} from 'node:path';
import {readJson,verifyArchive,sha256} from '../compatibility.mjs';
import {BUNDLE_ID,run} from './context.mjs';

export const RUNTIME_REVISION=1;
export function validateCatalog(value){
  if(value?.schema!==1||value.bundleIdentifier!==BUNDLE_ID||!Array.isArray(value.builds)||value.builds.length>200)throw Error('Invalid macOS compatibility catalog');
  for(const b of value.builds){
    if(!/^\d+(?:\.\d+){2,3}$/.test(b.version)||!/^\d+$/.test(b.build)||
      !['darwin-arm64','darwin-x64'].includes(b.platform)||
      !/^[a-f0-9]{64}$/.test(b.appAsarSha256)||!Number.isInteger(b.runtimeRevision)||b.runtimeRevision<1||
      !['isolated-native','signed-in'].includes(b.validation))throw Error('Invalid macOS compatibility entry');
  }
  return value;
}
export function selectBuild(catalog,app){
  if(app.bundleIdentifier!==BUNDLE_ID)return null;
  return validateCatalog(catalog).builds.find(b=>b.version===app.version&&b.build===app.build&&
    b.platform===app.platform&&b.runtimeRevision===RUNTIME_REVISION)||null;
}
export async function verifyApp(root,app,stateRoot,{force=false}={}){
  const entry=selectBuild(await readJson(join(root,'compatibility.json'),null),app);
  if(!entry)return {supported:false,reason:'unknown-build'};
  // Verify the untouched signed application as well as the renderer archive.
  try{await run('/usr/bin/codesign',['--verify','--strict',app.app],{timeout:20000});}
  catch{return {supported:false,reason:'invalid-signature'};}
  const archive=await verifyArchive(app.archive,entry.appAsarSha256,join(stateRoot,'archive-cache.json'),{force});
  return {supported:archive.valid,reason:archive.valid?'verified':'archive-mismatch',archiveCached:archive.cached,validation:entry.validation};
}
export async function verifyTheme(integrationRoot){
  const manifest=await readJson(join(integrationRoot,'macos/manifest.json'),null);
  if(manifest?.schema!==1||!manifest.files||!Object.keys(manifest.files).length)throw Error('主题构建清单缺失，请重新构建。');
  for(const [file,expected] of Object.entries(manifest.files)){
    if(file.includes('..')||file.startsWith('/')||!/^[a-f0-9]{64}$/.test(expected)||await sha256(join(integrationRoot,file))!==expected)throw Error('主题文件校验失败：'+file);
  }
  return true;
}
