import {readFile,writeFile,mkdir,copyFile,cp,access,readdir} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readJson,atomicJson} from './compatibility.mjs';
import {verifyVersion,prepareMedia,activate,digest} from './release-store.mjs';

const source=dirname(fileURLToPath(import.meta.url)),args=process.argv.slice(2),value=flag=>args.includes(flag)?args[args.indexOf(flag)+1]:null;
const test=args.includes('--test-install'),root=resolve(value('--root')||join(process.env.LOCALAPPDATA,'Linker','CodexTheme'));
const bundle=resolve(value('--bundle')||join(source,'dist','0.6.0'));
const publicKey=await readFile(join(source,'release-public.pem'),'utf8'),release=await verifyVersion(join(bundle,'runtime'),publicKey);
let backup=null;
try{
 const entries=await readdir(root);
 if(entries.length){
  if(!await readJson(join(root,'installation.json'),null))throw Error('Destination is not a recognized Linker installation');
  backup=join(test?dirname(root):join(process.env.LOCALAPPDATA,'Linker','Backups'),'CodexTheme-'+Date.now());
  await cp(root,backup,{recursive:true,errorOnExist:true,force:false});
 }
}catch(error){if(error.code!=='ENOENT')throw error;}
await mkdir(root,{recursive:true});
const versionDir=join(root,'versions',release.manifest.version);await mkdir(versionDir,{recursive:true});
for(const name of [...Object.keys(release.manifest.files),'release.json'])await copyFile(join(bundle,'runtime',name),join(versionDir,name));
await verifyVersion(versionDir,publicKey);
const rescue=release.manifest.files['boot-entry.mjs']?release:await verifyVersion(join(source,'dist','0.6.0','runtime'),publicKey);
await mkdir(join(root,'bootstrap-core'),{recursive:true});
for(const name of [...Object.keys(rescue.manifest.files),'release.json'])await copyFile(join(rescue.directory,name),join(root,'bootstrap-core',name));
await verifyVersion(join(root,'bootstrap-core'),publicKey);
for(const name of ['compatibility.mjs','release-store.mjs','release-public.pem','entrypoints.ps1','ShortcutIdentity.cs','notice.vbs'])await copyFile(join(source,name),join(root,name));
const media=await readFile(join(bundle,'media.json')).catch(()=>readFile(join(source,'bundle','media.json')));
if(digest(media)!==release.manifest.media.contentSha256)throw Error('Build media differs from release');
const mediaDirectory=join(root,'media',release.manifest.media.contentSha256);await mkdir(mediaDirectory,{recursive:true});await writeFile(join(mediaDirectory,'media.json'),media);
await prepareMedia(root,release.manifest,{fetcher:async()=>{throw Error('Local installer must not download media');}});
const config={enabled:true,language:'zh',sound:true,autoUpdate:true,...await readJson(join(root,'config.json'),{})};await atomicJson(join(root,'config.json'),config);
await activate(root,release.manifest.version);
await copyFile(join(source,'README.md'),join(root,'使用说明.md'));
await copyFile(join(source,'..','concept-v4','THIRD-PARTY-NOTICES.md'),join(root,'THIRD-PARTY-NOTICES.md'));
await copyFile(join(source,'bootstrap.mjs'),join(root,'bootstrap.mjs'));
for(const mode of ['launch','restore']){
 const command='"'+process.execPath+'" "'+join(root,'bootstrap.mjs')+'"'+(mode==='restore'?' --restore':'');
 const script='\uFEFFOption Explicit\r\nDim shell\r\nSet shell = CreateObject("WScript.Shell")\r\nshell.Run "'+command.replaceAll('"','""')+'", 0, False\r\n';
 await writeFile(join(root,mode+'.vbs'),Buffer.from(script,'utf16le'));
}
if(!test)await promisify(execFile)(join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-File',join(root,'entrypoints.ps1'),'-Action','Prepare'],{windowsHide:true,encoding:'utf8'});
await atomicJson(join(root,'installation.json'),{schema:3,installedAt:new Date().toISOString(),destination:root,node:process.execPath,themeRelease:release.manifest.version,backup,entryType:'taskbar',originalApplicationModified:false,originalProfileModified:false});
console.log(JSON.stringify({installed:true,root,version:release.manifest.version,backup,test}));
