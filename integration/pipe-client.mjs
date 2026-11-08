import {spawn} from 'node:child_process';
import {EventEmitter} from 'node:events';
export function launchPipe(executable,args=[],env={}){
 const child=spawn(executable,['--remote-debugging-pipe',...args],{windowsHide:false,stdio:['ignore','pipe','pipe','pipe','pipe'],env:{...process.env,...env}});
 const events=new EventEmitter(),pending=new Map();let serial=0,buffer='',closed=false,logTail='';
 for(const stream of [child.stdout,child.stderr])stream.on('data',d=>logTail=(logTail+d.toString()).slice(-3000));
 child.stdio[3].on('error',()=>{});child.stdio[4].on('error',()=>{});
 child.stdio[4].on('data',d=>{buffer+=d.toString();let index;while((index=buffer.indexOf('\0'))>=0){const line=buffer.slice(0,index);buffer=buffer.slice(index+1);let m;try{m=JSON.parse(line)}catch{continue}if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}else if(m.method)events.emit(m.method,m.params,m.sessionId);}});
 child.on('exit',(code,signal)=>{closed=true;for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Application closed'));}pending.clear();events.emit('closed',{code,signal});});
 child.on('error',e=>events.emit('launchError',e));
 function call(method,params={},sessionId,timeout=15000){return new Promise((resolve,reject)=>{if(closed){reject(Error('Application is not running'));return;}const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timed out'));},timeout);pending.set(id,{resolve,reject,timer});child.stdio[3].write(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})})+'\0');});}
 return {child,events,call,get closed(){return closed},get logTail(){return logTail},async evaluate(session,expression,{userGesture=false}={}){const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture},session,30000);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;},disconnect(){for(const p of pending.values())clearTimeout(p.timer);pending.clear();for(const s of [child.stdin,child.stdout,child.stderr,child.stdio[3],child.stdio[4]])s?.destroy();child.unref();}};
}
