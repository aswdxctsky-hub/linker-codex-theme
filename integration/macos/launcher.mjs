import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdir,open,unlink,readFile,appendFile,stat,rename} from 'node:fs/promises';
import {watchFile,unwatchFile} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {launchPipe} from '../pipe-client.mjs';
import {mountTheme} from '../media-delivery.mjs';
import {atomicJson,readJson} from '../compatibility.mjs';
import {discoverApp,defaultState,appProcesses,processIdentity,original,notify,isolatedProfile} from './context.mjs';
import {verifyApp,verifyTheme} from './compatibility.mjs';

const root=dirname(fileURLToPath(import.meta.url)),integration=dirname(root);
const isMain=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
export const cleanConfig=value=>({enabled:value?.enabled!==false,language:value?.language==='en'?'en':'zh',sound:value?.sound!==false});
const mainTarget=t=>t.type==='page'&&/^app:\/\/-\/index\.html(?:[?#]|$)/.test(t.url);

export class MacLauncher{
  constructor(options={}){
    this.options=options;this.stateRoot=resolve(options.stateRoot||defaultState());
    this.configPath=join(this.stateRoot,'config.json');this.lockPath=join(this.stateRoot,'launcher.lock');
    this.statePath=join(this.stateRoot,'state.json');this.sessions=new Map();this.pending=new Set();
    this.binding='__linker_'+randomBytes(12).toString('hex');this.nonce=randomBytes(12).toString('hex');
    this.settingsQueue=Promise.resolve();this.stateQueue=Promise.resolve();this.started=performance.now();this.timings={};
    this.introShown=false;this.ended=false;this.ownedLock=false;
  }
  mark(name){this.timings[name]=Math.round(performance.now()-this.started);}
  async log(event,detail=''){
    const path=join(this.stateRoot,'launcher.log');
    try{if((await stat(path)).size>200000)await rename(path,path+'.previous');}catch{}
    await appendFile(path,new Date().toISOString()+' '+event+' '+detail+'\n',{mode:0o600});
  }
  async state(change){
    this.stateQueue=this.stateQueue.catch(()=>{}).then(async()=>{
      await atomicJson(this.statePath,{...await readJson(this.statePath,{}),...change,updatedAt:new Date().toISOString()});
    });return this.stateQueue;
  }
  async saveConfig(change){
    this.settingsQueue=this.settingsQueue.catch(()=>{}).then(async()=>{
      this.config={...cleanConfig(await readJson(this.configPath,{})),...change};
      await atomicJson(this.configPath,this.config);
    });return this.settingsQueue;
  }
  async message(text){await notify(text,{quiet:this.options.quiet||!!this.options.testProfile});}
  async restore(){
    await this.saveConfig({enabled:false});
    for(const entry of this.sessions.values())await this.client?.evaluate(entry.sessionId,'window.__linkerThemeV4?.dispose();true').catch(()=>{});
    await this.state({themeEnabled:false,mounted:false});
  }
  async acquire(){
    let owner=await readJson(this.lockPath,null);
    if(owner){
      const identity=await processIdentity(owner.pid);
      if(identity&&identity===owner.identity)return false;
      const current=await readJson(this.lockPath,null);
      if(current?.nonce!==owner.nonce)return false;
      await unlink(this.lockPath).catch(()=>{});
    }
    let handle;
    try{handle=await open(this.lockPath,'wx',0o600);}catch(error){if(error.code==='EEXIST')return false;throw error;}
    try{await handle.writeFile(JSON.stringify({pid:process.pid,identity:await processIdentity(process.pid),nonce:this.nonce}));}
    finally{await handle.close();}
    this.ownedLock=true;return true;
  }
  async openOriginal(){if(!this.options.testProfile&&this.app)await original(this.app.app);}
  async apply(entry){
    if(entry.busy||this.ended)return;entry.busy=true;
    try{
      let ready=false;
      for(let i=0;i<150&&!this.ended;i++){
        ready=await this.client.evaluate(entry.sessionId,"location.protocol==='app:'&&location.hostname==='-'&&location.pathname==='/index.html'&&document.readyState!=='loading'&&!!document.body&&!!document.head&&!!document.getElementById('root')");
        if(ready)break;await delay(100);
      }
      if(!ready||this.ended)return;
      if(!this.config.enabled){await this.client.evaluate(entry.sessionId,'window.__linkerThemeV4?.dispose();true');return;}
      if(await this.client.evaluate(entry.sessionId,'!!window.__linkerThemeV4')){
        await this.client.evaluate(entry.sessionId,'window.__linkerThemeV4.update('+JSON.stringify(this.config)+');true');return;
      }
      await this.client.call('Runtime.addBinding',{name:this.binding},entry.sessionId);
      const {mounted,delivery}=await mountTheme(this.client,entry.sessionId,this.runtime,this.media,
        {config:this.config,binding:this.binding,platform:'darwin',playIntro:!this.introShown});
      delivery.catch(error=>this.log('media-delivery-failed',error.message));
      if(!mounted?.installed)throw Error('主题未挂载到已验证的主窗口。');
      this.introShown=true;this.mark('mounted');
      await this.state({mounted:true,themeEnabled:true,language:this.config.language,timings:this.timings});
      await this.log('mounted',this.app.version);
    }catch(error){
      await this.client.evaluate(entry.sessionId,'window.__linkerThemeV4?.dispose();true').catch(()=>{});
      await this.log('mount-failed',error.message);await this.state({mounted:false,error:error.message});
    }finally{entry.busy=false;}
  }
  async attach(target){
    if(!mainTarget(target)||this.ended||this.sessions.has(target.targetId)||this.pending.has(target.targetId))return;
    this.pending.add(target.targetId);
    try{
      const {sessionId}=await this.client.call('Target.attachToTarget',{targetId:target.targetId,flatten:true});
      const entry={targetId:target.targetId,sessionId,busy:false};this.sessions.set(target.targetId,entry);
      await this.client.call('Runtime.enable',{},sessionId);await this.client.call('Page.enable',{},sessionId);
      await this.apply(entry);
    }catch(error){await this.log('attach-failed',error.message);}
    finally{this.pending.delete(target.targetId);}
  }
  async settingsChanged(){
    this.config=cleanConfig(await readJson(this.configPath,{}));
    await this.state({themeEnabled:this.config.enabled,language:this.config.language});
    for(const entry of this.sessions.values())await this.apply(entry);
  }
  async bindingCalled(params,sessionId){
    if(params.name!==this.binding||![...this.sessions.values()].some(e=>e.sessionId===sessionId))return;
    const message=JSON.parse(params.payload);
    if(message.action==='enabled'&&message.value===false)await this.restore();
    if(message.action==='language'&&['zh','en'].includes(message.value))await this.saveConfig({language:message.value});
    if(message.action==='sound'&&typeof message.value==='boolean')await this.saveConfig({sound:message.value});
    if(message.action==='introComplete'&&['complete','skipped','media-error','render-error'].includes(message.value))await this.state({lastIntroResult:message.value});
  }
  async start(){
    await mkdir(this.stateRoot,{recursive:true,mode:0o700});
    this.config=cleanConfig(await readJson(this.configPath,{}));
    if(this.options.restore){await this.restore();return {reason:'restored'};}
    if(this.options.enable)await this.saveConfig({enabled:true});
    this.app=await discoverApp(this.options.app);this.mark('discovery');
    if(this.options.diagnose){
      await verifyTheme(integration);
      const check=await verifyApp(root,this.app,this.stateRoot,{force:this.options.fullCheck});
      return {...check,app:this.app,config:this.config,officialRunning:(await appProcesses(this.app.executable)).filter(p=>!p.isolated).length};
    }
    if(!this.config.enabled){await this.openOriginal();return {reason:'disabled'};}
    if(!await this.acquire()){await this.openOriginal();return {reason:'already-running'};}
    try{
      if(!this.options.testProfile&&(await appProcesses(this.app.executable)).some(p=>!p.isolated)){
        await this.state({running:false,mounted:false,reason:'restart-required',pid:null,launcherPid:null});
        await this.cleanup();await this.message('ChatGPT 正在运行。请先用 ⌘Q 完全退出，再打开主题启动器。');
        return {reason:'restart-required'};
      }
      await verifyTheme(integration);
      const check=await verifyApp(root,this.app,this.stateRoot,{force:this.options.fullCheck});this.mark('verified');
      if(!check.supported){
        await this.state({running:false,mounted:false,reason:check.reason,version:this.app.version,pid:null,launcherPid:null});
        await this.cleanup();await this.openOriginal();
        await this.message('当前应用版本尚未通过主题兼容检查，已保留原版。版本：'+this.app.version);
        return check;
      }
      this.runtime=await readFile(join(integration,'bundle/runtime.js'),'utf8');
      this.media=JSON.parse(await readFile(join(integration,'bundle/media.json'),'utf8'));
      if(this.options.testProfile)this.profile=await isolatedProfile(join(this.stateRoot,'profiles'));
      this.client=launchPipe(this.app.executable,this.profile?.args||[],this.profile?.env||{});this.mark('spawned');
      this.client.events.on('Target.targetCreated',p=>this.attach(p.targetInfo).catch(()=>{}));
      this.client.events.on('Target.targetInfoChanged',p=>this.attach(p.targetInfo).catch(()=>{}));
      this.client.events.on('Target.detachedFromTarget',p=>{for(const [id,e] of this.sessions)if(e.sessionId===p.sessionId)this.sessions.delete(id);});
      this.client.events.on('Page.loadEventFired',(_,sessionId)=>{const e=[...this.sessions.values()].find(e=>e.sessionId===sessionId);if(e)this.apply(e).catch(()=>{});});
      this.client.events.on('Runtime.bindingCalled',(p,s)=>this.bindingCalled(p,s).catch(e=>this.log('settings-failed',e.message)));
      this.client.events.on('closed',()=>this.cleanup().catch(()=>{}));
      this.client.events.on('launchError',e=>this.log('launch-error',e.message).catch(()=>{}));
      await this.state({running:true,mounted:false,themeEnabled:true,pid:this.client.child.pid,launcherPid:process.pid,
        version:this.app.version,testProfile:!!this.profile,reason:null,error:null,validation:check.validation,archiveCached:check.archiveCached});
      await this.client.call('Browser.getVersion');
      await this.client.call('Target.setDiscoverTargets',{discover:true});
      for(const target of (await this.client.call('Target.getTargets')).targetInfos)await this.attach(target);
      watchFile(this.configPath,{interval:750},()=>this.settingsChanged().catch(e=>this.log('settings-failed',e.message)));
      return {reason:'running',pid:this.client.child.pid,profile:this.profile?.root};
    }catch(error){
      await this.log('launch-failed',error.message);
      for(const entry of this.sessions.values())await this.client?.evaluate(entry.sessionId,'window.__linkerThemeV4?.dispose();true').catch(()=>{});
      const hadApp=!!this.client&&!this.client.closed;
      await this.cleanup();if(!hadApp)await this.openOriginal();
      throw error;
    }
  }
  async cleanup(){
    if(this.ended)return;this.ended=true;unwatchFile(this.configPath);
    if(this.ownedLock){
      await this.state({running:false,mounted:false,pid:null,launcherPid:null});
      const owner=await readJson(this.lockPath,null);
      if(owner?.nonce===this.nonce)await unlink(this.lockPath).catch(()=>{});
      this.ownedLock=false;
    }
    this.client?.disconnect();
  }
}

export function parseArgs(args){
  const options={};
  for(let i=0;i<args.length;i++){
    const key=args[i];
    if(['--app','--state-dir'].includes(key)){
      if(!args[i+1]||args[i+1].startsWith('--'))throw Error(key+' 需要路径。');
      options[key==='--app'?'app':'stateRoot']=resolve(args[++i]);
    }else if(['--diagnose','--full-check','--restore','--enable','--test-profile','--quiet'].includes(key)){
      const map={'--full-check':'fullCheck','--test-profile':'testProfile'};options[map[key]||key.slice(2)]=true;
    }else throw Error('未知参数：'+key);
  }
  if(options.restore&&options.enable)throw Error('--restore 与 --enable 不能同时使用。');
  if(options.testProfile&&!options.stateRoot)throw Error('--test-profile 必须指定独立的 --state-dir。');
  if(options.testProfile&&options.stateRoot===defaultState())throw Error('测试不能使用正式主题资料目录。');
  return options;
}
if(isMain){
  let launcher;
  try{
    launcher=new MacLauncher(parseArgs(process.argv.slice(2)));
    const result=await launcher.start();console.log(JSON.stringify(result,null,2));
    const stop=async()=>{
      for(const entry of launcher.sessions.values())await launcher.client?.evaluate(entry.sessionId,'window.__linkerThemeV4?.dispose();true').catch(()=>{});
      await launcher.cleanup();process.exit(0);
    };
    process.once('SIGTERM',stop);process.once('SIGINT',stop);
  }catch(error){
    console.error(error.message);process.exitCode=1;
    if(launcher&&!launcher.options.diagnose)await launcher.message('主题未加载。'+error.message).catch(()=>{});
  }
}
