import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {access,realpath,mkdir,mkdtemp} from 'node:fs/promises';
import {join,resolve,basename} from 'node:path';
import {homedir} from 'node:os';

export const run=promisify(execFile);
export const BUNDLE_ID='com.openai.codex';
export const defaultState=()=>join(homedir(),'Library','Application Support','Linker','CodexTheme');
export async function discoverApp(requested){
  if(process.platform!=='darwin')throw Error('此启动器仅支持 macOS。');
  const candidates=requested?[resolve(requested)]:[
    '/Applications/ChatGPT.app','/Applications/Codex.app',
    join(homedir(),'Applications/ChatGPT.app'),join(homedir(),'Applications/Codex.app'),
  ];
  for(const candidate of candidates){
    try{
      const app=await realpath(candidate);
      const {stdout}=await run('/usr/bin/plutil',['-convert','json','-o','-',join(app,'Contents/Info.plist')]);
      const info=JSON.parse(stdout),name=info.CFBundleExecutable;
      if(info.CFBundleIdentifier!==BUNDLE_ID||typeof name!=='string'||basename(name)!==name)continue;
      const executable=join(app,'Contents/MacOS',name),archive=join(app,'Contents/Resources/app.asar');
      await access(executable);await access(archive);
      return {app,executable,archive,bundleIdentifier:info.CFBundleIdentifier,
        version:info.CFBundleShortVersionString,build:String(info.CFBundleVersion),
        chromium:info.ChromiumBaseVersion,platform:'darwin-'+process.arch};
    }catch(error){if(requested)throw Error('无法读取指定应用：'+error.message);}
  }
  throw Error('未找到支持的 ChatGPT / Codex 应用。请通过 --app 指定官方 .app。');
}

// Match the full executable path before checking arguments; never match a helper,
// shell command, or an unrelated app by a generic process name.
export function parseProcesses(stdout,executable,argumentsText=''){
  const args=new Map(argumentsText.split('\n').map(line=>line.match(/^\s*(\d+)\s+(.+)$/)).filter(Boolean).map(m=>[Number(m[1]),m[2]]));
  const result=[];
  for(const line of stdout.split('\n')){
    const match=line.match(/^\s*(\d+)\s+(\d+)\s+(.+)$/);
    if(!match)continue;
    if(match[3]!==executable)continue;
    const command=args.get(Number(match[1]))||match[3];
    result.push({pid:Number(match[1]),parentPid:Number(match[2]),command,
      isolated:command.includes('--user-data-dir=')});
  }
  return result;
}
export async function appProcesses(executable){
  const {stdout}=await run('/bin/ps',['-ww','-axo','pid=,ppid=,comm='],{maxBuffer:8*1024*1024});
  const hosts=parseProcesses(stdout,executable);
  if(!hosts.length)return [];
  const args=await run('/bin/ps',['-ww','-p',hosts.map(p=>p.pid).join(','),'-o','pid=,args=']).catch(()=>({stdout:''}));
  return parseProcesses(stdout,executable,args.stdout);
}
export async function processIdentity(pid){
  if(!Number.isInteger(pid)||pid<1)return null;
  try{
    const {stdout}=await run('/bin/ps',['-p',String(pid),'-o','lstart=,args=']);
    return stdout.trim()||null;
  }catch{return null;}
}
export async function original(app){await run('/usr/bin/open',[app]);}
export async function notify(message,{quiet=false}={}){
  if(quiet){console.log(message);return;}
  // The message is an argv value, never interpolated into AppleScript source.
  await run('/usr/bin/osascript',['-e','on run argv','-e','display alert "Linker 主题" message (item 1 of argv) as informational buttons {"好"} default button "好"','-e','end run',message]);
}
export async function isolatedProfile(parent){
  await mkdir(parent,{recursive:true,mode:0o700});
  const root=await mkdtemp(join(resolve(parent),'mac-'));
  const browser=join(root,'browser'),data=join(root,'codex');
  await mkdir(browser,{mode:0o700});await mkdir(data,{mode:0o700});
  return {root,browser,data,args:['--user-data-dir='+browser,'--no-first-run'],
    env:{CODEX_ELECTRON_USER_DATA_PATH:browser,CODEX_HOME:data,CODEX_SQLITE_HOME:join(data,'sqlite'),
      CODEX_ACCESS_TOKEN:undefined,CODEX_ENVIRONMENT_ID:undefined,CODEX_EXEC_SERVER_REMOTE_BASE_URL:undefined}};
}
