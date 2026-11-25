import {createServer} from 'node:net';
import {mkdtemp,writeFile,readFile,rm,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {execFile} from 'node:child_process';
import {EventEmitter} from 'node:events';
import {promisify} from 'node:util';
const run=promisify(execFile),here=dirname(fileURLToPath(import.meta.url));

export async function launchPackaged(pkg,args=[],env={}, {debug=true,hostPath=join(here,'PackageHost.exe')}={}){
 const startedAt=Date.now();
 const token=randomBytes(32).toString('hex'),pipe='Linker.Theme.App.'+randomBytes(24).toString('hex');
 const folder=await mkdtemp(join(tmpdir(),'linker-package-')),request=join(folder,'request.json');
 const events=new EventEmitter(),pending=new Map(),child={pid:null,unref(){}};
 let socket,buffer='',serial=0,closed=false,identity;
 function finish(){if(closed)return;closed=true;for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Application closed'));}pending.clear();events.emit('closed');}
 let ready,fail;const started=new Promise((a,b)=>{ready=a;fail=b;});started.catch(()=>{});
 const server=createServer(connection=>{
  if(socket){connection.destroy();return;}socket=connection;connection.setEncoding('utf8');
  connection.on('error',error=>{fail(error);finish();});connection.on('close',()=>{fail(Error('Package host disconnected'));finish();});
  connection.on('data',chunk=>{buffer+=chunk;let i;while((i=buffer.indexOf('\0'))>=0){const line=buffer.slice(0,i);buffer=buffer.slice(i+1);let m;try{m=JSON.parse(line);}catch{continue;}
   if(!child.pid){if(m.hostError){fail(Error(m.hostError));continue;}if(!m.hostReady||m.token!==token||!Number.isSafeInteger(m.pid)){fail(Error('Invalid package host handshake'));connection.destroy();return;}child.pid=m.pid;identity=m.identity;server.close();ready();continue;}
   if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}else if(m.method)events.emit(m.method,m.params,m.sessionId);
  }});
 });
 await new Promise((a,b)=>{server.once('error',b);server.listen('\\\\.\\pipe\\'+pipe,a);});
 try{
  await writeFile(request,JSON.stringify({pipe,token,executable:join(pkg.path,'app','ChatGPT.exe'),args,env,debug,family:pkg.family,expectedVersion:pkg.version}),{mode:0o600});
  const activation=run(join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-File',join(here,'package-launch.ps1'),'-Family',pkg.family,'-HostPath',hostPath,'-RequestPath',request],{windowsHide:true,timeout:20000});
  activation.catch(fail);
  const timer=setTimeout(async()=>fail(Error(await readFile(request+'.error','utf8').catch(()=>'Package activation timed out'))),25000);
  try{await started;await activation;}finally{clearTimeout(timer);}
 }catch(error){socket?.destroy();server.close();throw error;}finally{await rm(request,{force:true});await rm(request+'.error',{force:true});await rmdir(folder).catch(()=>{});}
 function call(method,params={},sessionId,timeout=15000){return new Promise((resolve,reject)=>{if(closed){reject(Error('Application is not running'));return;}const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timed out'));},timeout);pending.set(id,{resolve,reject,timer});socket.write(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})})+'\0');});}
 return {child,events,call,identity,startedAt,get closed(){return closed;},get logTail(){return '';},async evaluate(session,expression,{userGesture=false}={}){const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture},session,30000);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;},disconnect(){socket?.destroy();finish();}};
}
