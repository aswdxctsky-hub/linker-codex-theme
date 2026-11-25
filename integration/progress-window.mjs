import {spawn} from 'node:child_process';
import {EventEmitter} from 'node:events';
import {join} from 'node:path';

export function progressWindow(directory,mediaDirectory,{enabled=true,startedAt=performance.now()}={}){
 const events=new EventEmitter();let closed=false,child=null,readyAt=null,lastUpdate=null;
 const started=startedAt;
 function open(attempt=0){
  if(closed)return;
  try{child=spawn(join(directory,'ProgressWindow.exe'),[mediaDirectory],{windowsHide:false,stdio:['pipe','pipe','pipe']});}
  catch(error){if(attempt<2){setTimeout(()=>open(attempt+1),150);return;}queueMicrotask(()=>events.emit('failure',error));return;}
  let buffer='';child.stdout.on('data',chunk=>{buffer+=chunk.toString();let at;while((at=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,at);buffer=buffer.slice(at+1);try{const value=JSON.parse(line);if(value.type==='ready')readyAt=Math.round(performance.now()-started);events.emit(value.type,value);}catch{}}});
  child.stderr.on('data',()=>{});child.stdin.on('error',()=>{});
  child.on('error',error=>events.emit('failure',error));child.on('exit',()=>{closed=true;events.emit('closed');});
  if(lastUpdate)child.stdin.write(JSON.stringify(lastUpdate)+'\n');
 }
 if(enabled)open();
 return {events,get child(){return child;},get readyMs(){return readyAt;},update(value){lastUpdate=value;if(child&&!closed)child.stdin.write(JSON.stringify(value)+'\n');},close(){if(closed)return;closed=true;if(child){child.stdin.end(JSON.stringify({close:true})+'\n');const deadline=setTimeout(()=>child.kill(),2000);deadline.unref();child.on('exit',()=>clearTimeout(deadline));}}};
}
